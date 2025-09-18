# repo-audit.ps1
param(
  [string]$OutDir = "reports",
  [switch]$RestoreDeleted
)

$ErrorActionPreference = "Stop"

function Exec($args) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "git"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.ArgumentList = $args
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    throw "git $args`n$stderr"
  }
  return $stdout.TrimEnd()
}

# Ensure we're in a Git repo
try {
  $root = Exec @("rev-parse","--show-toplevel")
} catch {
  Write-Host "✗ Not inside a Git repository. cd into your repo and re-run." -ForegroundColor Red
  exit 1
}
Set-Location $root

# Gather Git state (fast, reliable)
$trackedModified = (Exec @("ls-files","-m")) -split "`n" | Where-Object {$_} | ForEach-Object { $_.Replace("\","/") }
$trackedDeleted  = (Exec @("ls-files","-d")) -split "`n" | Where-Object {$_} | ForEach-Object { $_.Replace("\","/") }
$untracked       = (Exec @("ls-files","--others","--exclude-standard")) -split "`n" | Where-Object {$_} | ForEach-Object { $_.Replace("\","/") }

$modSet = [System.Collections.Generic.HashSet[string]]::new()
$delSet = [System.Collections.Generic.HashSet[string]]::new()
$untrk  = [System.Collections.Generic.HashSet[string]]::new()
$trackedModified | ForEach-Object { $null = $modSet.Add($_) }
$trackedDeleted  | ForEach-Object { $null = $delSet.Add($_) }
$untracked       | ForEach-Object { $null = $untrk.Add($_) }

# Build list of files to inspect (all repo files + deleted)
$allFiles = Get-ChildItem -Recurse -File | ForEach-Object {
  ($_.FullName.Replace("\","/")).Substring($root.Length + 1)
}
$all = New-Object System.Collections.Generic.HashSet[string]
$allFiles | ForEach-Object { $null = $all.Add($_) }
$trackedDeleted | ForEach-Object { $null = $all.Add($_) } # deleted tracked entries

# repo-audit.ps1 — robust, single-shot repo audit (PS 5.1+/7+)
$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }
function Info($msg) { Write-Host "$msg" -ForegroundColor DarkGray }
function Okay($msg) { Write-Host "✓ $msg" -ForegroundColor Green }

# 1) Find Git root (works for .git dir or file/worktree)
$gitRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $gitRoot) { Fail "Not inside a Git repository. (git rev-parse failed)" }
Set-Location $gitRoot
Info ("Repo root: {0}" -f $gitRoot)

Write-Host "`n=== STATUS SUMMARY ===" -ForegroundColor Cyan

# 2) Gather status (tracked modified/deleted; untracked respecting .gitignore)
$modifiedTracked = @(git ls-files -m)
$deletedTracked  = @(git ls-files --deleted)
$untracked       = @(git ls-files --others --exclude-standard)

"{0} modified, {1} deleted (tracked), {2} untracked" -f $modifiedTracked.Count, $deletedTracked.Count, $untracked.Count

if ($deletedTracked.Count) {
  Write-Host "`nDeleted (tracked):" -ForegroundColor Yellow
  $deletedTracked | ForEach-Object { "  - $_" }
}

# 3) Key voice files — existence + size + timestamps
Write-Host "`n=== KEY VOICE FILES ===" -ForegroundColor Cyan
$voicePaths = @(
  'backend/routes/voice.ts',
  'backend/server.ts',
  'backend/services/OpenAIRealtime.ts',
  'backend/services/StreamingVoiceService.ts',
  'app/main/voiceHandler.ts',
  'app/renderer/renderer.tsx',
  'app/renderer/services/config.ts',
  'app/renderer/services/VoiceService.ts',
  'app/renderer/services/api/sttClient.ts',
  'app/renderer/services/api/voiceClient.ts',
  'app/renderer/components/DiagnosticPanel.tsx',
  'voice-probe.ps1',
  'webpack.config.js',
  'package.json'
)

$voiceRows = foreach ($p in $voicePaths) {
  $full = Join-Path $gitRoot $p
  if (Test-Path $full) {
    $fi = Get-Item $full
    [PSCustomObject]@{
      Path          = $p
      Exists        = $true
      SizeBytes     = $fi.Length
      Created       = $fi.CreationTime
      LastWriteTime = $fi.LastWriteTime
    }
  } else {
    [PSCustomObject]@{
      Path          = $p
      Exists        = $false
      SizeBytes     = $null
      Created       = $null
      LastWriteTime = $null
    }
  }
}
$voiceRows | Sort-Object Path | Format-Table -AutoSize

# 4) Top 20 most-recently modified files (anywhere in repo)
Write-Host "`n=== TOP 20 RECENTLY MODIFIED FILES ===" -ForegroundColor Cyan
Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 20 FullName, Length, LastWriteTime |
  Format-Table -AutoSize

# 5) Full CSV snapshot (path, size, created, modified)
$reportsDir = Join-Path $gitRoot 'reports'
if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir | Out-Null }
$stamp = (Get-Date).ToString('yyyyMMdd_HHmmss')
$csvPath = Join-Path $reportsDir ("repo_audit_{0}.csv" -f $stamp)

Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
  Select-Object @{n='Path';e={$_.FullName.Substring($gitRoot.Length).TrimStart('\','/')}},
                FullName, Length, CreationTime, LastWriteTime |
  Export-Csv -NoTypeInformation -Encoding UTF8 $csvPath

Okay ("Snapshot written: {0}" -f $csvPath)

# 6) Hint to restore deleted tracked files (only if any)
if ($deletedTracked.Count) {
  Write-Host "`nTo restore deleted tracked files:" -ForegroundColor DarkGray
  "git restore -- " + ($deletedTracked -join ' ')
}

# Helper to get FS metadata if present
function Get-FileInfoObj([string]$relPath) {
  $full = Join-Path $root $relPath
  $exists = Test-Path -LiteralPath $full
  $size = $null; $ctime=$null; $mtime=$null
  if ($exists) {
    $fi = Get-Item -LiteralPath $full
    $size  = $fi.Length
    $ctime = $fi.CreationTimeUtc
    $mtime = $fi.LastWriteTimeUtc
  }
  $status = if ($delSet.Contains($relPath)) { "D" }
           elseif ($modSet.Contains($relPath)) { "M" }
           elseif ($untrk.Contains($relPath))  { "??" }
           else { "" } # clean/tracked or unknown
  [pscustomobject]@{
    Path        = $relPath
    Exists      = $exists
    GitStatus   = $status
    SizeBytes   = $size
    CreatedUtc  = $ctime
    ModifiedUtc = $mtime
    Extension   = [IO.Path]::GetExtension($relPath)
  }
}

# Build rows
$rows = foreach ($p in $all) { Get-FileInfoObj $p }

# Make sure reports/ exists
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$csv   = Join-Path $OutDir "repo_audit_$stamp.csv"
$json  = Join-Path $OutDir "repo_audit_$stamp.json"

# Save artifacts
$rows | Sort-Object Path | Export-Csv -NoTypeInformation -Path $csv -Encoding UTF8
$rows | Sort-Object Path | ConvertTo-Json -Depth 5 | Out-File -FilePath $json -Encoding UTF8

# Console summary
$modifiedN = ($rows | Where-Object { $_.GitStatus -eq "M" }).Count
$deletedN  = ($rows | Where-Object { $_.GitStatus -eq "D" }).Count
$untrackedN= ($rows | Where-Object { $_.GitStatus -eq "??" }).Count
$totalN    = $rows.Count

Write-Host "=== Repo Audit (relative to $root) ===" -ForegroundColor Cyan
Write-Host ("Total files seen: {0}" -f $totalN)
Write-Host ("Modified (tracked): {0}" -f $modifiedN) -ForegroundColor Yellow
Write-Host ("Deleted  (tracked): {0}" -f $deletedN)  -ForegroundColor Red
Write-Host ("Untracked (new):    {0}" -f $untrackedN) -ForegroundColor Green

# Spotlight: key voice files
$spot = @(
  "backend/routes/voice.ts",
  "backend/server.ts",
  "app/main/voiceHandler.ts",
  "app/renderer/services/VoiceService.ts",
  "app/renderer/services/config.ts",
  "app/renderer/config/endpoints.ts",
  "app/renderer/renderer.tsx",
  "voice-probe.ps1",
  "fixtures/hello_luna.wav"
)
Write-Host "`n-- Key voice files --" -ForegroundColor Cyan
foreach ($s in $spot) {
  $r = $rows | Where-Object { $_.Path -ieq $s }
  if ($null -ne $r) {
    "{0} | Exists={1} | Status={2} | ModifiedUtc={3}" -f $r.Path,$r.Exists,$r.GitStatus,$r.ModifiedUtc
  } else {
    "{0} | not found in index or FS" -f $s
  }
}

# Show tracked deletions with quick-restore hint
if ($deletedN -gt 0) {
  Write-Host "`n-- Tracked deletions --" -ForegroundColor Yellow
  $rows | Where-Object { $_.GitStatus -eq "D" } | ForEach-Object {
    Write-Host $_.Path
  }
  if ($RestoreDeleted) {
    Write-Host "`nRestoring tracked deletions from HEAD..." -ForegroundColor Yellow
    $toRestore = ($rows | Where-Object { $_.GitStatus -eq "D" }).Path
    if ($toRestore.Count -gt 0) {
      Exec @("restore","--source=HEAD","--") | Out-Null  # prints help if no paths
      # feed paths in manageable batches
      foreach ($batch in ($toRestore | ForEach-Object { $_ } | ForEach-Object -Begin { $list=@() } -Process {
        $list += $_; if ($list.Count -ge 50) { ,$list; $list=@() }
      } -End { if ($list.Count) { ,$list } })) {
        Exec @("restore","--source=HEAD","--") + $batch | Out-Null
      }
      Write-Host "✓ Restore attempted. Re-run audit to confirm." -ForegroundColor Green
    }
  } else {
    Write-Host "`nTo restore all tracked deletions from HEAD:" -ForegroundColor DarkGray
    Write-Host "  git restore --source=HEAD -- (list above)" -ForegroundColor DarkGray
  }
}

Write-Host "`nArtifacts:" -ForegroundColor Cyan
Write-Host "  CSV : $csv"
Write-Host "  JSON: $json"
Write-Host "`nDone."
