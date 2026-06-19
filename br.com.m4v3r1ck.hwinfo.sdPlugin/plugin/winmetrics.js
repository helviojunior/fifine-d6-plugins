/**
 * Shared Windows metrics reader (no admin required).
 *
 * Runs ONE PowerShell snapshot and caches it for a short window so every tile
 * (CPU, GPU, RAM, clock, …) shares a single process spawn per poll cycle. The
 * Windows analog of macOS's `top`/`ioreg`/`vm_stat` calls.
 *
 * Everything here comes from CIM "PerfFormattedData" classes whose names and
 * properties are English/locale-independent — unlike Get-Counter paths, which
 * are localized — and readable without elevation:
 *   - Win32_OperatingSystem                          → physical RAM
 *   - Win32_Processor                                → load %, current/max MHz
 *   - Win32_PerfFormattedData_PerfOS_Processor       → user / privileged %
 *   - Win32_PageFileUsage                            → page file (≈ swap)
 *   - Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine        → GPU util %
 *   - Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory → VRAM bytes
 *   - root/wmi MSAcpi_ThermalZoneTemperature         → CPU temp °C (best effort)
 *
 * Temperature/power/fan that ACPI doesn't expose come from the optional sensor
 * helper instead (see sensors.js / helper/sensors-daemon.ps1).
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const exec = promisify(execFile);

// Single-quoted PS literals throughout so nothing here needs escaping.
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$os  = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor
$cp  = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
$pf  = Get-CimInstance Win32_PageFileUsage

$gpuUtil = 0
$ge = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
if ($ge) {
  $d3 = ($ge | Where-Object { $_.Name -like '*engtype_3D*' } | Measure-Object -Property UtilizationPercentage -Sum).Sum
  if ($d3) { $gpuUtil = $d3 } else { $gpuUtil = ($ge | Measure-Object -Property UtilizationPercentage -Maximum).Maximum }
}

$gpuMemBytes = 0
$gm = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory
if ($gm) { $gpuMemBytes = ($gm | Measure-Object -Property DedicatedUsage -Maximum).Maximum }

$cpuTempC = $null
$tz = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature
if ($tz) {
  $t = ($tz | Measure-Object -Property CurrentTemperature -Maximum).Maximum
  if ($t -and $t -gt 0) { $cpuTempC = [math]::Round($t / 10 - 273.15, 1) }
}

# Canonical CPU total used by EVERY CPU tile (headline, gauge, history) so they
# always agree. Primary source is PerfOS user+privileged time (== 100 - idle);
# if that class is briefly unavailable, fall back to Win32_Processor's coarser
# LoadPercentage. One source everywhere = no "number doesn't match the graph".
$cpuUser = if ($cp) { [double]$cp.PercentUserTime } else { 0 }
$cpuSys  = if ($cp) { [double]$cp.PercentPrivilegedTime } else { 0 }
$cpuTotal = $cpuUser + $cpuSys
if (-not $cp -or $cpuTotal -le 0) {
  $cpuTotal = [double]((($cpu | Measure-Object -Property LoadPercentage -Average).Average))
}
$cpuTotal = [math]::Round([math]::Min(100, [math]::Max(0, $cpuTotal)))

# Live CPU clock. Win32_Processor.CurrentClockSpeed is static on Windows — it
# reports a stale power-state snapshot (often stuck at a low idle value) and
# never reflects turbo. The real effective frequency is base (MaxClockSpeed) x
# PercentProcessorPerformance, which CAN exceed 100% under turbo. Fall back to
# CurrentClockSpeed only if the ProcessorInformation perf class is unavailable.
$cpuMaxMHz = [double]($cpu | Measure-Object -Property MaxClockSpeed -Maximum).Maximum
$cpuClockMHz = 0
$pi = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
if ($pi -and $cpuMaxMHz -gt 0) {
  $perfPct = [double]$pi.PercentProcessorPerformance
  if ($perfPct -gt 0) { $cpuClockMHz = [math]::Round($cpuMaxMHz * $perfPct / 100) }
}
if ($cpuClockMHz -le 0) {
  $cpuClockMHz = [double]($cpu | Measure-Object -Property CurrentClockSpeed -Maximum).Maximum
}

[ordered]@{
  cpuLoad     = $cpuTotal
  cpuUser     = $cpuUser
  cpuSys      = $cpuSys
  cpuClockMHz = $cpuClockMHz
  cpuMaxMHz   = $cpuMaxMHz
  cpuTempC    = $cpuTempC
  totalKB     = [double]$os.TotalVisibleMemorySize
  freeKB      = [double]$os.FreePhysicalMemory
  pfTotalMB   = [double](($pf | Measure-Object -Property AllocatedBaseSize -Sum).Sum)
  pfUsedMB    = [double](($pf | Measure-Object -Property CurrentUsage -Sum).Sum)
  gpuUtil     = [math]::Round([double]$gpuUtil)
  gpuMemMB    = [math]::Round([double]$gpuMemBytes / 1MB)
} | ConvertTo-Json -Compress
`;

// Pass the script as a base64 UTF-16LE -EncodedCommand so none of its quotes,
// pipes or newlines are mangled by Windows command-line argument quoting.
const ENCODED = Buffer.from(SCRIPT, "utf16le").toString("base64");

let cache = null;
let cacheAt = 0;
const TTL_MS = 1500;

async function snapshot() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  const { stdout } = await exec(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", ENCODED],
    { windowsHide: true, maxBuffer: 1 << 20 }
  );
  cache = JSON.parse(stdout.trim());
  cacheAt = now;
  return cache;
}

module.exports = { snapshot };
