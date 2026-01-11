import fs from 'fs/promises';
import { resolveToolNames } from './src/shared/toolParser.js';

const sessionFile = 'C:\\Users\\buzzkill\\.claude\\projects\\C--Users-buzzkill-Documents-saasmetrics\\agent-e346da25.jsonl';

async function testExtraction() {
  const content = await fs.readFile(sessionFile, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l.trim());

  const toolUsage = new Map<string, number>();

  console.log(`Processing ${lines.length} lines...`);
  let toolUseCount = 0;

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    try {
      const entry = JSON.parse(line);

      // Check for direct tool_use entry
      if (entry.type === 'tool_use' || entry.tool_use) {
        console.log(`Line ${i}: Direct tool_use entry found`);
        const tool = entry.tool_use || entry;
        const toolName = tool.name;
        const toolInput = tool.input;
        if (toolName) {
          toolUseCount++;
          const resolvedNames = resolveToolNames(toolName, toolInput);
          console.log(`  Tool: ${toolName} -> ${resolvedNames}`);
          for (const name of resolvedNames) {
            toolUsage.set(name, (toolUsage.get(name) || 0) + 1);
          }
        }
      }

      // Check for tool_use in message.content array
      if (entry.message?.content && Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use' && block.name) {
            toolUseCount++;
            const resolvedNames = resolveToolNames(block.name, block.input);
            console.log(`Line ${i}: message.content tool_use: ${block.name} -> ${resolvedNames}`);
            for (const name of resolvedNames) {
              toolUsage.set(name, (toolUsage.get(name) || 0) + 1);
            }
          }
        }
      }
    } catch (error) {
      console.log(`Line ${i}: Parse error`);
    }
  }

  console.log(`\nTotal tool_use entries found: ${toolUseCount}`);
  console.log('\nTool usage map:');
  for (const [name, count] of toolUsage) {
    console.log(`  ${name}: ${count}`);
  }
}

testExtraction().catch(console.error);
