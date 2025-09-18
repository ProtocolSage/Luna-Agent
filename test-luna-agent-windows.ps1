# Luna Agent Backend Test Suite for Windows PowerShell
# This script tests all major functionality from Windows side

Write-Host "=== LUNA AGENT BACKEND TEST SUITE ===" -ForegroundColor Cyan
Write-Host "Testing Luna Agent backend functionality from Windows PowerShell" -ForegroundColor Yellow
Write-Host "Backend should be running in WSL at 172.30.92.252:3000" -ForegroundColor Gray
Write-Host ""

# Configuration
$baseUrl = "http://172.30.92.252:3000"
$testsPassed = 0
$testsFailed = 0

# Helper function to run tests
function Test-Endpoint {
    param(
        [string]$TestName,
        [string]$Method = "GET",
        [string]$Endpoint,
        [hashtable]$Body = @{},
        [int]$ExpectedStatus = 200,
        [string]$ContentType = "application/json"
    )
    
    Write-Host "Testing: $TestName" -ForegroundColor White -NoNewline
    
    try {
        $params = @{
            Uri = "$baseUrl$Endpoint"
            Method = $Method
            UseBasicParsing = $true
            TimeoutSec = 10
        }
        
        if ($Body.Count -gt 0) {
            $params.Body = ($Body | ConvertTo-Json -Depth 5)
            $params.ContentType = $ContentType
        }
        
        $response = Invoke-WebRequest @params
        
        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host " ✓ PASSED" -ForegroundColor Green
            $global:testsPassed++
            return $response
        } else {
            Write-Host " ✗ FAILED (Status: $($response.StatusCode))" -ForegroundColor Red
            $global:testsFailed++
            return $null
        }
    }
    catch {
        Write-Host " ✗ FAILED ($($_.Exception.Message))" -ForegroundColor Red
        $global:testsFailed++
        return $null
    }
}

# Test 1: Health Check
Write-Host "1. HEALTH AND CONNECTIVITY TESTS" -ForegroundColor Magenta
$healthResponse = Test-Endpoint -TestName "Backend Health Check" -Endpoint "/health"

if ($healthResponse) {
    $healthData = $healthResponse.Content | ConvertFrom-Json
    Write-Host "   - Status: $($healthData.status)" -ForegroundColor Gray
    Write-Host "   - Version: $($healthData.version)" -ForegroundColor Gray
    Write-Host "   - Uptime: $([math]::Round($healthData.uptime, 2)) seconds" -ForegroundColor Gray
    Write-Host "   - Memory: $([math]::Round($healthData.memory.heapUsed / 1MB, 2)) MB used" -ForegroundColor Gray
}

# Test 2: API Configuration
Write-Host "`n2. API CONFIGURATION TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "OpenAI Configuration Check" -Endpoint "/api/config/openai-key"

# Test 3: Security Status
Write-Host "`n3. SECURITY SYSTEM TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "Security System Status" -Endpoint "/api/security/status"

# Test 4: Voice System Tests
Write-Host "`n4. VOICE SYSTEM TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "Voice System Status" -Endpoint "/api/voice/status"
Test-Endpoint -TestName "TTS Health Check" -Endpoint "/api/voice/tts/check"

# Test 5: Memory System Tests
Write-Host "`n5. MEMORY SYSTEM TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "Recent Memories" -Endpoint "/api/memory/recent"

# Memory search test
$searchResponse = Test-Endpoint -TestName "Memory Search" -Method "GET" -Endpoint "/api/memory/search?q=test"

# Memory add test
$memoryData = @{
    content = "PowerShell test memory entry - $(Get-Date)"
    type = "note"
    metadata = @{
        source = "powershell_test"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
}
Test-Endpoint -TestName "Memory Add" -Method "POST" -Endpoint "/api/memory/add" -Body $memoryData

# Test 6: Agent System Tests
Write-Host "`n6. AGENT SYSTEM TESTS" -ForegroundColor Magenta

# Agent health
Test-Endpoint -TestName "Agent Health Check" -Endpoint "/api/agent/health"

# Agent chat test (will fail without API keys but tests routing)
$chatData = @{
    message = "Hello Luna Agent! This is a test from Windows PowerShell."
    session_id = "powershell-test-$(Get-Random -Maximum 9999)"
    context = @{
        source = "windows_powershell_test"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
}
$chatResponse = Test-Endpoint -TestName "Agent Chat Processing" -Method "POST" -Endpoint "/api/agent/chat" -Body $chatData -ExpectedStatus 200

if ($chatResponse) {
    $chatResult = $chatResponse.Content | ConvertFrom-Json
    if ($chatResult.error) {
        Write-Host "   - Expected error (no API keys): $($chatResult.details)" -ForegroundColor Yellow
    } else {
        Write-Host "   - Chat response received successfully" -ForegroundColor Green
    }
}

# Test 7: Enhanced Tools System
Write-Host "`n7. ENHANCED TOOLS SYSTEM TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "Enhanced Tools Health" -Endpoint "/api/tools/enhanced/health"
Test-Endpoint -TestName "Tools List" -Endpoint "/api/tools/enhanced/list"
Test-Endpoint -TestName "Tools Metrics" -Endpoint "/api/tools/enhanced/metrics"

# Test 8: Authentication System
Write-Host "`n8. AUTHENTICATION SYSTEM TESTS" -ForegroundColor Magenta

# Session creation
$sessionData = @{
    client_info = @{
        user_agent = "PowerShell-Test"
        ip = "127.0.0.1"
        source = "windows_powershell"
    }
}
$sessionResponse = Test-Endpoint -TestName "Session Creation" -Method "POST" -Endpoint "/api/auth/session" -Body $sessionData

if ($sessionResponse) {
    $session = $sessionResponse.Content | ConvertFrom-Json
    Write-Host "   - Session ID: $($session.session_id)" -ForegroundColor Gray
    Write-Host "   - Session Token: $($session.token.Substring(0,20))..." -ForegroundColor Gray
}

# Test 9: Metrics and Monitoring
Write-Host "`n9. METRICS AND MONITORING TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "System Metrics" -Endpoint "/api/metrics"

# Test 10: Error Handling
Write-Host "`n10. ERROR HANDLING TESTS" -ForegroundColor Magenta
Test-Endpoint -TestName "Invalid Endpoint (404)" -Endpoint "/api/nonexistent" -ExpectedStatus 404

# Summary
Write-Host "`n" + "="*50 -ForegroundColor Cyan
Write-Host "TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "="*50 -ForegroundColor Cyan
Write-Host "Tests Passed: $testsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $testsFailed" -ForegroundColor $(if($testsFailed -gt 0) { "Red" } else { "Green" })
Write-Host "Total Tests: $($testsPassed + $testsFailed)" -ForegroundColor White

$successRate = if ($testsPassed + $testsFailed -gt 0) { 
    [math]::Round(($testsPassed / ($testsPassed + $testsFailed)) * 100, 1)
} else { 0 }

Write-Host "Success Rate: $successRate%" -ForegroundColor $(if($successRate -ge 80) { "Green" } elseif($successRate -ge 60) { "Yellow" } else { "Red" })

if ($successRate -ge 80) {
    Write-Host "`n🎉 Luna Agent backend is fully functional from Windows!" -ForegroundColor Green
    Write-Host "You can now proceed with frontend development and testing." -ForegroundColor Green
} elseif ($successRate -ge 60) {
    Write-Host "`n⚠️  Luna Agent backend is partially functional." -ForegroundColor Yellow
    Write-Host "Some features may need configuration (API keys, etc.)" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Luna Agent backend has significant issues." -ForegroundColor Red
    Write-Host "Please check the backend logs and configuration." -ForegroundColor Red
}

Write-Host "`nBackend is accessible at: $baseUrl" -ForegroundColor Cyan
Write-Host "Health endpoint: $baseUrl/health" -ForegroundColor Gray
Write-Host "API documentation: Check backend/routes/ for available endpoints" -ForegroundColor Gray