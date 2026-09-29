import { execSync } from 'child_process';
import fs from 'fs';

const buildId = process.argv[2] || '6338a51f-7a26-4edc-9dc2-eb567c801be0';
try {
  const result = execSync(`npx eas build:view ${buildId} --json`, { encoding: 'utf-8' });
  const data = JSON.parse(result);
  const url = data.logFiles[0];
  
  const response = await fetch(url);
  const text = await response.text();
  
  const lines = text.split('\n');
  const logs = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.msg && (j.msg.includes('error') || j.msg.includes('Error') || j.msg.includes('FAILURE') || j.msg.includes('FAILED') || j.msg.includes('exception') || j.msg.includes('patch-package') || j.phase === 'RUN_GRADLEW')) {
        logs.push(j.msg || '');
      }
    } catch(e) {
      if (line.includes('error') || line.includes('Error') || line.includes('FAILURE') || line.includes('FAILED')) {
        logs.push(line);
      }
    }
  }
  
  console.log(logs.slice(-100).join('\n'));

} catch (e) {
  console.error(e);
}
