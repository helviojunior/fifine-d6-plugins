#Requires -Version 5.1
<#
  Removes the Windows HWiNFO sensor daemon Scheduled Task and its published JSON.
  Run from an elevated PowerShell (Run as administrator).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$TaskName = "br.com.m4v3r1ck.hwinfo.sensors"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Elevation required — relaunching as administrator..."
  Start-Process powershell -Verb RunAs -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`"")
  return
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:TEMP "hwinfo-sensors.json") -Force -ErrorAction SilentlyContinue

Write-Host "Uninstalled HWiNFO sensor daemon."
