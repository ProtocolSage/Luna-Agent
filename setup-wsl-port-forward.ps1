# WSL Port Forwarding Setup for Luna Agent
# This script sets up port forwarding from Windows to WSL for localhost:3000

Write-Host "Setting up WSL port forwarding for Luna Agent..." -ForegroundColor Green

# Get WSL IP address (this should match the current WSL IP)
$wslIP = "172.30.92.252"
$port = 3000

Write-Host "WSL IP: $wslIP" -ForegroundColor Yellow
Write-Host "Port: $port" -ForegroundColor Yellow

# Remove any existing port proxy for this port
Write-Host "Removing existing port proxy..." -ForegroundColor Cyan
try {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=localhost 2>$null
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=127.0.0.1 2>$null
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
}
catch {
    Write-Host "No existing proxy to remove" -ForegroundColor Gray
}

# Add new port proxy
Write-Host "Adding port proxy from localhost:${port} to WSL ${wslIP}:${port}..." -ForegroundColor Cyan
$result = netsh interface portproxy add v4tov4 listenport=$port listenaddress=localhost connectport=$port connectaddress=$wslIP

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Port forwarding configured successfully!" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to configure port forwarding" -ForegroundColor Red
    Write-Host "Error: $result" -ForegroundColor Red
    exit 1
}

# Show current port proxy configuration
Write-Host "`nCurrent port proxy configuration:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

# Test the connection
Write-Host "`nTesting connection..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:${port}/health" -TimeoutSec 10 -UseBasicParsing
    Write-Host "✓ Connection test successful!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Content length: $($response.Content.Length) bytes" -ForegroundColor Green
} catch {
    Write-Host "✗ Connection test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This might be normal if the backend is not running" -ForegroundColor Yellow
}

Write-Host "`nPort forwarding setup complete!" -ForegroundColor Green
Write-Host "You can now access Luna Agent backend from Windows at: http://localhost:${port}" -ForegroundColor Yellow
Write-Host "`nTo remove port forwarding later, run:" -ForegroundColor Gray
Write-Host "netsh interface portproxy delete v4tov4 listenport=$port listenaddress=localhost" -ForegroundColor Gray