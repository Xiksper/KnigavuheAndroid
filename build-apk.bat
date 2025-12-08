@echo off
setlocal

rem Non-interactive flags for Expo/Gradle prompts
set "CI=1"
set "EXPO_NO_GIT_STATUS_CHECK=1"
set "EXPO_CLI_NO_PROMPT=1"

rem Paths
set "ROOT=%~dp0"
set "APP_DIR=%ROOT%reactNativeApp"
set "APK_SRC=%APP_DIR%\android\app\build\outputs\apk\release\app-release.apk"
set "APK_OUT_DIR=%ROOT%apk"
set "APK_DST=%APK_OUT_DIR%\audio-book.apk"

echo [1/6] Killing java/gradle processes...
powershell -Command "Get-Process java,gradle* -ErrorAction SilentlyContinue | Stop-Process -Force"

echo [2/6] Cleaning android/app/build...
powershell -Command "Set-Location '%APP_DIR%'; Remove-Item -Recurse -Force 'android/app/build' -ErrorAction SilentlyContinue"

echo [3/6] npx expo prebuild --clean...
pushd "%APP_DIR%" || goto :err
call npx expo prebuild --clean
if errorlevel 1 goto :err

echo [4/6] gradlew assembleRelease...
pushd android || goto :err
call gradlew.bat assembleRelease
if errorlevel 1 goto :err
popd

echo [5/6] Preparing apk folder...
if not exist "%APK_OUT_DIR%" mkdir "%APK_OUT_DIR%"

echo [6/6] Copying APK to %APK_DST% ...
if not exist "%APK_SRC%" (
  echo APK not found at: %APK_SRC%
  goto :err
)
copy /Y "%APK_SRC%" "%APK_DST%" >nul || goto :err

echo Done: %APK_DST%
popd
exit /b 0

:err
echo Failed with exit code %errorlevel%.
popd 2>nul
exit /b %errorlevel%
