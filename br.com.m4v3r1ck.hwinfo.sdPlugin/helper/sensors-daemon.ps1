#Requires -Version 5.1
<#
  HWiNFO sensor daemon (Windows) — the counterpart of helper/sensors-daemon.sh.

  Windows has no built-in, no-admin way to read die temperature / package power /
  fan RPM (Win32 perf counters don't expose them). This daemon instead reads a
  running sensor provider's WMI namespace and republishes the values to
  %TEMP%\hwinfo-sensors.json, which the plugin reads (plugin/sensors.js).

  Supported providers (run one of them, as administrator, with WMI export on):
    - LibreHardwareMonitor   (namespace root/LibreHardwareMonitor)   [preferred]
    - OpenHardwareMonitor    (namespace root/OpenHardwareMonitor)

  Published fields: ts, cpuTempC, gpuTempC, cpuPowerW, cpuClockMHz, fanRpm,
                    gpuClockMHz, gpuPowerW.
#>
[CmdletBinding()]
param(
  [int]$IntervalSeconds = $(if ($env:HWINFO_INTERVAL) { [int]$env:HWINFO_INTERVAL } else { 2 })
)

$ErrorActionPreference = "SilentlyContinue"
$Out = Join-Path $env:TEMP "hwinfo-sensors.json"

function Get-SensorNamespace {
  foreach ($ns in @("root/LibreHardwareMonitor", "root/OpenHardwareMonitor")) {
    $probe = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue
    if ($probe) { return $ns }
  }
  return $null
}

function Max-Value($sensors, $type, $idLike, $nameLike) {
  $set = $sensors | Where-Object { $_.SensorType -eq $type }
  if ($idLike)   { $set = $set | Where-Object { $_.Identifier -like $idLike } }
  if ($nameLike) { $set = $set | Where-Object { $_.Name -like $nameLike } }
  if (-not $set) { return $null }
  return ($set | Measure-Object -Property Value -Maximum).Maximum
}

function Json-Num($v, $decimals = 1) {
  if ($null -eq $v) { return "null" }
  return ([math]::Round([double]$v, $decimals)).ToString([System.Globalization.CultureInfo]::InvariantCulture)
}

while ($true) {
  $ns = Get-SensorNamespace
  $cpuTemp = $null; $gpuTemp = $null; $cpuPwr = $null; $cpuClk = $null
  $fan = $null; $gpuClk = $null; $gpuPwr = $null

  if ($ns) {
    $s = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue
    # CPU (LHM identifiers: /intelcpu, /amdcpu; OHM: /cpu)
    $cpuTemp = Max-Value $s "Temperature" "*cpu*" "*Package*"
    if ($null -eq $cpuTemp) { $cpuTemp = Max-Value $s "Temperature" "*cpu*" $null }
    $cpuPwr  = Max-Value $s "Power" "*cpu*" "*Package*"
    if ($null -eq $cpuPwr) { $cpuPwr = Max-Value $s "Power" "*cpu*" $null }
    $cpuClk  = Max-Value $s "Clock" "*cpu*" "*Core*"
    # GPU (/gpu, /gpu-nvidia, /gpu-amd, /gpu-intel)
    $gpuTemp = Max-Value $s "Temperature" "*gpu*" "*Core*"
    if ($null -eq $gpuTemp) { $gpuTemp = Max-Value $s "Temperature" "*gpu*" $null }
    $gpuClk  = Max-Value $s "Clock" "*gpu*" "*Core*"
    $gpuPwr  = Max-Value $s "Power" "*gpu*" $null
    # Fan
    $fan     = Max-Value $s "Fan" $null $null
  }

  $ts = [int][double]::Parse(((Get-Date).ToUniversalTime() - (Get-Date "1970-01-01 00:00:00Z").ToUniversalTime()).TotalSeconds)
  $line = '{0}"ts":{1},"cpuTempC":{2},"gpuTempC":{3},"cpuPowerW":{4},"cpuClockMHz":{5},"fanRpm":{6},"gpuClockMHz":{7},"gpuPowerW":{8}{9}' -f `
    '{', $ts, (Json-Num $cpuTemp), (Json-Num $gpuTemp), (Json-Num $cpuPwr), (Json-Num $cpuClk 0), (Json-Num $fan 0), (Json-Num $gpuClk 0), (Json-Num $gpuPwr), '}'

  $tmp = "$Out.tmp"
  Set-Content -Path $tmp -Value $line -Encoding ASCII
  Move-Item -Path $tmp -Destination $Out -Force

  Start-Sleep -Seconds $IntervalSeconds
}
