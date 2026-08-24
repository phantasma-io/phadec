import type { DecodeOutput } from '../types/decoded.js';

function renderJson(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

function renderPretty(output: DecodeOutput): string {
  const lines: string[] = [];
  lines.push(`Source: ${output.source}`);
  lines.push(`Input: ${output.input}`);
  if (output.rpc) {
    lines.push(`RPC: ${output.rpc.url} (${output.rpc.method})`);
  }

  if (output.errors.length > 0) {
    lines.push('Errors:');
    for (const err of output.errors) {
      lines.push(`- ${err}`);
    }
  }

  if (output.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of output.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (output.carbon) {
    lines.push('Carbon:');
    lines.push(renderJson(output.carbon));
  }

  if (output.vm) {
    lines.push('VM:');
    lines.push(renderJson(output.vm));
  }

  if (output.event) {
    lines.push('Event:');
    lines.push(renderJson(output.event));
  }

  if (output.rom) {
    lines.push('ROM:');
    lines.push(renderJson(output.rom));
  }

  if (output.vmObject) {
    lines.push('VMObject:');
    lines.push(renderJson(output.vmObject));
  }

  if (output.address) {
    lines.push('Address:');
    lines.push(renderJson(output.address));
  }

  return lines.join('\n');
}

export function renderOutput(output: DecodeOutput): string {
  if (output.format === 'json') {
    return renderJson(output);
  }
  return renderPretty(output);
}
