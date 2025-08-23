# Luna Agent Session Management Testing Script
# Quick sanity tests for the bulletproof session fix

Write-Host "=== Luna Agent Session Management Tests ===" -ForegroundColor Cyan
Write-Host ""

$API_BASE = "http://localhost:3003"
$sessionId = ""

# Test 1: New session creation
Write-Host "Test 1: Creating new session..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/auth/session" -Method POST -Headers @{"content-type"="application/json"} -Body "{}" -TimeoutSec 10
    $sessionId = $response.sessionId
    Write-Host "✅ Session created successfully: $sessionId" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Session creation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 2: Validate using header (lower-case)
Write-Host "Test 2: Validating session using header..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/auth/validate" -Method GET -Headers @{"x-session-id"=$sessionId} -TimeoutSec 10
    Write-Host "✅ Header validation successful" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Header validation failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Validate using cookie
Write-Host "Test 3: Validating session using cookie..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/auth/validate" -Method GET -Headers @{"Cookie"="sid=$sessionId"} -TimeoutSec 10
    Write-Host "✅ Cookie validation successful" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Cookie validation failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Test CSRF token generation
Write-Host "Test 4: Generating CSRF token..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/auth/csrf-token" -Method POST -Headers @{"x-session-id"=$sessionId; "Content-Type"="application/json"} -Body "{}" -TimeoutSec 10
    Write-Host "✅ CSRF token generated successfully" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ CSRF token generation failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Test heartbeat
Write-Host "Test 5: Testing heartbeat..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/auth/heartbeat" -Method POST -Headers @{"x-session-id"=$sessionId; "Content-Type"="application/json"} -Body "{}" -TimeoutSec 10
    Write-Host "✅ Heartbeat successful" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Heartbeat failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 6: Test TTS endpoint (should handle 404 gracefully)
Write-Host "Test 6: Testing TTS endpoint availability..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/voice/tts/check" -Method GET -TimeoutSec 10
    Write-Host "✅ TTS endpoint available" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✅ TTS endpoint properly returns 404 (expected for fallback)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ TTS endpoint error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "All core session management tests completed." -ForegroundColor Green
Write-Host "Session ID used for testing: $sessionId" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start the Luna Agent frontend" -ForegroundColor White
Write-Host "2. Verify session persistence across page refreshes" -ForegroundColor White
Write-Host "3. Test voice functionality with secure session" -ForegroundColor White
Write-Host "4. Check browser dev tools for proper cookie setting" -ForegroundColor White
