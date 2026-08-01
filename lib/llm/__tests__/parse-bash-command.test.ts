import { describe, it, expect } from 'vitest';
import { parseBashCommand } from '../tool-registry';

describe('empty quoted arguments', () => {
  it('preserves empty double-quoted arg', () => {
    const args = parseBashCommand('echo "first" "" "third"');
    expect(args).toEqual(['echo', 'first', '', 'third']);
  });

  it('preserves empty single-quoted arg', () => {
    const args = parseBashCommand("echo 'first' '' 'third'");
    expect(args).toEqual(['echo', 'first', '', 'third']);
  });
});

describe('backslash handling in double quotes', () => {
  it('preserves literal backslash-n in double quotes', () => {
    const args = parseBashCommand('echo "test\\nline"');
    expect(args[1]).toBe('test\\nline');
  });

  it('handles escaped double quote inside double quotes', () => {
    const args = parseBashCommand('echo "say \\"hello\\""');
    expect(args[1]).toBe('say "hello"');
  });

  it('handles escaped backslash inside double quotes', () => {
    const args = parseBashCommand('echo "path\\\\to\\\\file"');
    expect(args[1]).toBe('path\\to\\file');
  });

  it('preserves backslash-t in double quotes', () => {
    const args = parseBashCommand('echo "col1\\tcol2"');
    expect(args[1]).toBe('col1\\tcol2');
  });
});

describe('brace expansion respects quotes', () => {
  it('does not expand braces inside single-quoted arg', () => {
    const args = parseBashCommand("sed -i 's/old/{x: 1, y: 2}/' /file.txt");
    const sedExpr = args.find(a => a.startsWith('s/'));
    expect(sedExpr).toBe('s/old/{x: 1, y: 2}/');
  });

  it('does not expand braces inside double-quoted arg', () => {
    const args = parseBashCommand('echo "file{1,2,3}.txt"');
    expect(args[1]).toBe('file{1,2,3}.txt');
  });

  it('expands braces in unquoted arguments', () => {
    const args = parseBashCommand('echo file{1,2,3}.txt');
    expect(args).toContain('file1.txt');
    expect(args).toContain('file2.txt');
    expect(args).toContain('file3.txt');
  });
});

describe('control operators written without spaces', () => {
  // Everything downstream matches operators by whole-token equality, so `600;` hid the `;`
  // and the pipe splitter then consumed the rest of the line.
  it('splits a trailing semicolon off the preceding token', () => {
    expect(parseBashCommand('head -c 600; echo hi')).toEqual([
      'head', '-c', '600', ';', 'echo', 'hi',
    ]);
  });

  it('splits pipes and chain operators written tight', () => {
    expect(parseBashCommand('cat /a|head -3')).toEqual(['cat', '/a', '|', 'head', '-3']);
    expect(parseBashCommand('ls&&pwd')).toEqual(['ls', '&&', 'pwd']);
    expect(parseBashCommand('ls||pwd')).toEqual(['ls', '||', 'pwd']);
  });

  it('does not read || as two pipes', () => {
    expect(parseBashCommand('a||b')).toEqual(['a', '||', 'b']);
  });

  it('leaves operators inside quoted arguments alone', () => {
    expect(parseBashCommand('echo "a;b"')).toEqual(['echo', 'a;b']);
    expect(parseBashCommand("rg 'foo|bar' /x")).toEqual(['rg', 'foo|bar', '/x']);
  });

  it('still splits operators that already had spaces', () => {
    expect(parseBashCommand('ls ; pwd')).toEqual(['ls', ';', 'pwd']);
  });

  // The command from the failing session, end to end.
  it('parses a mixed pipe + semicolon chain the way bash would', () => {
    expect(parseBashCommand("curl -s localhost/ | head -c 600; echo done")).toEqual([
      'curl', '-s', 'localhost/', '|', 'head', '-c', '600', ';', 'echo', 'done',
    ]);
  });
});
