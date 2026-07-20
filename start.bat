@echo off
title NexusDesk Launcher
echo.
echo  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗██████╗ ███████╗███████╗██╗  ██╗
echo  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝██║ ██╔╝
echo  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗██║  ██║█████╗  ███████╗█████╔╝
echo  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║██║  ██║██╔══╝  ╚════██║██╔═██╗
echo  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║██████╔╝███████╗███████║██║  ██╗
echo  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
echo.
echo  Premium Crypto Trading Command Center
echo  ----------------------------------------

IF NOT EXIST node_modules (
  echo  [*] First run detected. Installing dependencies...
  npm install
  echo  [*] Dependencies installed.
  echo.
)

echo  [*] Launching NexusDesk...
npm run start
