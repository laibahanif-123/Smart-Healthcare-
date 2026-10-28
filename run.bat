@echo off
echo ========================================================
echo   Smart Healthcare Project Management System (MERN)
echo ========================================================
echo.
echo Starting Backend Server on port 5000...
start cmd /k "cd server && npm start"

timeout /t 3 /nobreak >nul

echo Starting Frontend React Client on port 5173...
start cmd /k "cd client && npm run dev"

echo.
echo ========================================================
echo Both Backend (port 5000) and Frontend (port 5173) are running!
echo Open your browser at: http://localhost:5173
echo ========================================================
pause
