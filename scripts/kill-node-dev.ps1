$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue

if (-not $nodeProcesses) {
  Write-Host "No node processes found."
  exit 0
}

Write-Host "Node processes:"
$nodeProcesses | Select-Object Id, ProcessName, Path | Format-Table -AutoSize

Write-Host "Stopping all node processes..."
$nodeProcesses | Stop-Process -Force
