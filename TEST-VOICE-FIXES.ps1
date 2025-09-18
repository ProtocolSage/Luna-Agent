# TEST-VOICE-FIXES.ps1
# Test script to verify voice system fixes are working
# Run this from Windows PowerShell after starting your Luna Agent backend

Write-Host "🧪 TESTING VOICE SYSTEM FIXES" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Function to test an endpoint
function Test-Endpoint {
    param([string]$Url, [string]$Name, [string]$ExpectedContent = "")
    
    try {
        Write-Host "Testing $Name..." -ForegroundColor Yellow -NoNewline
        $response = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 10
        
        if ($response) {
            Write-Host " ✅ SUCCESS" -ForegroundColor Green
            
            # Show some response details
            if ($ExpectedContent -and $response.ToString().Contains($ExpectedContent)) {
                Write-Host "  └─ Found expected content: $ExpectedContent" -ForegroundColor DarkGreen
            }
            
            # Show key response fields
            if ($response.status) {
                Write-Host "  └─ Status: $($response.status)" -ForegroundColor DarkGreen
            }
            if ($response.streaming_available) {
                Write-Host "  └─ Streaming Available: $($response.streaming_available)" -ForegroundColor DarkGreen
            }
            if ($response.services) {
                Write-Host "  └─ Services: $($response.services | ConvertTo-Json -Compress)" -ForegroundColor DarkGreen
            }
            
            return $true
        } else {
            Write-Host " ❌ FAILED - No response" -ForegroundColor Red
            return $false
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        if ($statusCode -eq 401) {
            Write-Host " ❌ FAILED - 401 Unauthorized (Authentication required)" -ForegroundColor Red
            Write-Host "  └─ This endpoint should be public - there's still an auth issue!" -ForegroundColor Red
        } elseif ($statusCode -eq 404) {
            Write-Host " ❌ FAILED - 404 Not Found" -ForegroundColor Red
            Write-Host "  └─ Endpoint not available or backend not running" -ForegroundColor Red
        } else {
            Write-Host " ❌ FAILED - HTTP $statusCode" -ForegroundColor Red
            Write-Host "  └─ Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        return $false
    }
}

# Test ports to find which one the backend is running on
$testPorts = @(3000, 3001, 3002)
$backendPort = $null

Write-Host "🔍 FINDING BACKEND PORT..." -ForegroundColor Cyan
foreach ($port in $testPorts) {
    try {
        $healthUrl = "http://localhost:$port/health"
        $response = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 3
        if ($response.status -eq "OK") {
            $backendPort = $port
            Write-Host "✅ Found backend running on port $port" -ForegroundColor Green
            break
        }
    } catch {
        # Port not responding, try next
    }
}

if (-not $backendPort) {
    Write-Host "❌ BACKEND NOT FOUND" -ForegroundColor Red
    Write-Host "Please make sure your Luna Agent backend is running with:" -ForegroundColor Yellow
    Write-Host "  npm run dev:backend" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "🧪 TESTING PUBLIC VOICE DIAGNOSTIC ENDPOINTS..." -ForegroundColor Cyan
Write-Host "These should work WITHOUT authentication (no 401 errors)" -ForegroundColor Yellow
Write-Host ""

# Test the new public diagnostic endpoints
$endpoints = @(
    @{ Url = "http://localhost:$backendPort/health"; Name = "System Health"; Expected = "OK" },
    @{ Url = "http://localhost:$backendPort/api/voice/diagnostics/health"; Name = "Voice Health"; Expected = "ok" },
    @{ Url = "http://localhost:$backendPort/api/voice/diagnostics/status"; Name = "Voice Status"; Expected = "streaming_available" },
    @{ Url = "http://localhost:$backendPort/api/voice/diagnostics/capabilities"; Name = "Voice Capabilities"; Expected = "openai_realtime" }
)

$results = @()
foreach ($endpoint in $endpoints) {
    $result = Test-Endpoint -Url $endpoint.Url -Name $endpoint.Name -ExpectedContent $endpoint.Expected
    $results += $result
    Start-Sleep -Seconds 1
    Write-Host ""
}

# Test the OLD protected endpoints (should still return 401)
Write-Host "🔒 TESTING PROTECTED ENDPOINTS (should return 401)..." -ForegroundColor Cyan
Write-Host "These should require authentication" -ForegroundColor Yellow
Write-Host ""

$protectedEndpoints = @(
    @{ Url = "http://localhost:$backendPort/api/voice/streaming/status"; Name = "Protected Streaming Status" },
    @{ Url = "http://localhost:$backendPort/api/voice/streaming/health"; Name = "Protected Streaming Health" }
)

foreach ($endpoint in $protectedEndpoints) {
    try {
        Write-Host "Testing $($endpoint.Name)..." -ForegroundColor Yellow -NoNewline
        $response = Invoke-RestMethod -Uri $endpoint.Url -Method GET -TimeoutSec 5
        Write-Host " ❌ UNEXPECTED SUCCESS" -ForegroundColor Red
        Write-Host "  └─ This endpoint should be protected but isn't!" -ForegroundColor Red
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        if ($statusCode -eq 401) {
            Write-Host " ✅ CORRECTLY PROTECTED (401)" -ForegroundColor Green
            Write-Host "  └─ Authentication required as expected" -ForegroundColor DarkGreen
        } else {
            Write-Host " ⚠️  UNEXPECTED STATUS: $statusCode" -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

# Summary
$successCount = ($results | Where-Object { $_ -eq $true }).Count
$totalCount = $results.Count

Write-Host "📊 TEST RESULTS SUMMARY:" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host "Public endpoints working: $successCount/$totalCount" -ForegroundColor $(if($successCount -eq $totalCount) {"Green"} else {"Yellow"})
Write-Host ""

if ($successCount -eq $totalCount) {
    Write-Host "🎉 ALL VOICE FIXES WORKING! 🎉" -ForegroundColor Green -BackgroundColor DarkGreen
    Write-Host ""
    Write-Host "✅ Authentication issues resolved" -ForegroundColor Green
    Write-Host "✅ Public diagnostic endpoints working" -ForegroundColor Green
    Write-Host "✅ Voice system is ready for testing" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔗 AVAILABLE PUBLIC ENDPOINTS:" -ForegroundColor Cyan
    Write-Host "• Voice Health: http://localhost:$backendPort/api/voice/diagnostics/health" -ForegroundColor White
    Write-Host "• Voice Status: http://localhost:$backendPort/api/voice/diagnostics/status" -ForegroundColor White
    Write-Host "• Voice Capabilities: http://localhost:$backendPort/api/voice/diagnostics/capabilities" -ForegroundColor White
    Write-Host "• WebSocket: ws://localhost:$backendPort/ws/voice/stream" -ForegroundColor White
    Write-Host ""
    Write-Host "🚀 NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "1. Start the full Luna Agent application" -ForegroundColor White
    Write-Host "2. Test voice functionality in the UI" -ForegroundColor White
    Write-Host "3. The 401 authentication errors should be gone!" -ForegroundColor White
} else {
    Write-Host "⚠️  SOME TESTS FAILED" -ForegroundColor Yellow
    Write-Host "Please check the errors above and verify:" -ForegroundColor Yellow
    Write-Host "1. Backend is running with npm run dev:backend" -ForegroundColor White
    Write-Host "2. No compilation errors in the backend" -ForegroundColor White
    Write-Host "3. Routes are properly mounted" -ForegroundColor White
}

Write-Host ""
Write-Host "Test completed at $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor DarkGray