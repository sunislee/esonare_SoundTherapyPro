$DownloadBase = "https://gitee.com/sunislee/sound-therapy-assets/raw/master"
$TargetDir = "C:\Users\Administrator\Desktop\nginx-1.24.0\nginx-1.24.0\html\resources"
Write-Host "Starting download..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path "$TargetDir\base" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\fx" | Out-Null
New-Item -ItemType Directory -Force -Path "$TargetDir\interactive" | Out-Null
$files = @("base/deep_ocean_abyss.m4a","base/foggy_forest_ritual.m4a","base/deep_sea_breathing_rhythm.m4a","base/misty_woods_dripping.m4a","base/morning_river.mp3","base/night_tribe.mp3","base/rain_boat.mp3","fx/library_vibe.m4a","fx/zen_bowl.m4a","base/liquid_peace.m4a","base/crystal_bowl.m4a","base/alpha_wave.m4a","base/binaural_beat.mp3","interactive/white_noise.m4a","interactive/wind-chime.m4a","interactive/breath.m4a","interactive/apple_crunch.m4a","interactive/match_strike.wav")
foreach ($f in $files) { Write-Host "Downloading $f..." -ForegroundColor Cyan; Invoke-WebRequest -Uri "$DownloadBase/$f" -OutFile "$TargetDir\$f" }
Write-Host "Done!" -ForegroundColor Green
