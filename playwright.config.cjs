const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests/ui',workers:1,reporter:'list',
  use:{timezoneId:'Europe/Moscow',baseURL:'http://127.0.0.1:4173',viewport:{width:412,height:915},deviceScaleFactor:1,launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},
  webServer:{command:'npm run preview',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI}
});
