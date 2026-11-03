import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,timeout:30000,outputDir:'.wrangler/browser-results',reporter:'list',use:{baseURL:'http://127.0.0.1:8790',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']}}});
