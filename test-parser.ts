import { resolveToolNames, parseBashCommand, parseMcpCliTool } from './src/shared/toolParser.js';

console.log('=== Test parseBashCommand ===');
console.log('git status:', parseBashCommand('git status'));
console.log('npm run build:', parseBashCommand('npm run build'));
console.log('find command:', parseBashCommand('find some-path'));

console.log('');
console.log('=== Test resolveToolNames ===');
console.log('Bash with command:', resolveToolNames('Bash', { command: 'git status' }));
console.log('Glob:', resolveToolNames('Glob', { pattern: '**/*.ts' }));
console.log('Read:', resolveToolNames('Read', { file_path: '/some/file' }));

console.log('');
console.log('=== Test parseMcpCliTool ===');
console.log('goodvibes/search_skills:', parseMcpCliTool('plugin_goodvibes_goodvibes-tools/search_skills'));
