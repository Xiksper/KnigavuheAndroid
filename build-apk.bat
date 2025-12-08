@echo off
setlocal

rem Paths
set "ROOT=%~dp0"
set "APP_DIR=%ROOT%reactNativeApp"
set "APK_SRC=%APP_DIR%\android\app\build\outputs\apk\release\app-release.apk"
set "APK_OUT_DIR=%ROOT%apk"
set "APK_DST=%APK_OUT_DIR%\audio-book.apk"

echo [1/6] Останавливаю java/gradle процессы...
powershell -Command "Get-Process java,gradle* -ErrorAction SilentlyContinue | Stop-Process -Force"

echo [2/6] Удаляю android\app\build...
powershell -Command "Set-Location '%APP_DIR%'; Remove-Item -Recurse -Force 'android/app/build' -ErrorAction SilentlyContinue"

echo [3/6] npx expo prebuild --clean...
pushd "%APP_DIR%" || goto :err
npx expo prebuild --clean || goto :err

echo [4/6] gradlew assembleRelease...
pushd android || goto :err
call gradlew.bat assembleRelease || goto :err
popd

echo [5/6] Готовлю папку для APK...
if not exist "%APK_OUT_DIR%" mkdir "%APK_OUT_DIR%"

echo [6/6] Копирую APK в %APK_DST% ...
if not exist "%APK_SRC%" (
  echo Не найден исходный APK: %APK_SRC%
  goto :err
)
copy /Y "%APK_SRC%" "%APK_DST%" >nul || goto :err

echo Готово: %APK_DST%
popd
exit /b 0

:err
echo Сборка прервана с кодом %errorlevel%.
popd 2>nul
exit /b %errorlevel%
