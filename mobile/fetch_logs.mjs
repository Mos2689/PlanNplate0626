import { execSync } from 'child_process';
import fs from 'fs';

try {
  const result = execSync('npx eas build:view 1933780f-f71e-4840-a335-18877d4f61c9 --json', { encoding: 'utf-8' });
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
      if (j.phase === 'RUN_GRADLEW') {
        errors.push(j.msg || '');
      }
    } catch(e) {}
  }
  
  console.log(errors.slice(-300).join('\n'));
} catch (e) {
  console.error(e);
}
