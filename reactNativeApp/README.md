Get-Process java,gradle* -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force android\app\build
npx expo prebuild --clean
cd .\android\
.\gradlew assembleRelease
cd .\android\app\build\outputs\apk\release