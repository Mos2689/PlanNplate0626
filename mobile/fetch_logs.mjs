import { execSync } from 'child_process';
import fs from 'fs';

try {
  const result = execSync('npx eas build:view 5980ea53-400f-4fc8-92be-5a18955bfbd1 --json', { encoding: 'utf-8' });
  const data = JSON.parse(result);
  const url = data.logFiles[0];
  
  const response = await fetch(url);
  const text = await response.text();
  
  const lines = text.split('\n');
  const errors = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.msg && (j.msg.includes('error') || j.msg.includes('Error') || j.msg.includes('FAILURE') || j.msg.includes('FAILED') || j.msg.includes('exception') || j.phase === 'RUN_GRADLEW')) {
        errors.push(j.msg || '');
      }
    } catch(e) {
      if (line.includes('error') || line.includes('Error') || line.includes('FAILURE') || line.includes('FAILED')) {
        errors.push(line);
      }
    }
  }
  
  console.log(errors.slice(-100).join('\n'));
} catch (e) {
  console.error(e);
}
