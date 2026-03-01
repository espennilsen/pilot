import { describe, it, expect } from 'vitest';
import { cleanErrorMessage } from '../../../src/lib/error-messages';

describe('cleanErrorMessage', () => {
  it('strips "Error: " prefix', () => {
    const result = cleanErrorMessage('Error: Something went wrong');
    expect(result).toBe('Something went wrong');
  });

  it('strips "Error invoking remote method" wrapper', () => {
    const message = "Error invoking remote method 'agent:send-message': Error: Network failure";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Network failure');
  });

  it('handles Error objects', () => {
    const error = new Error('File not found');
    const result = cleanErrorMessage(error);
    expect(result).toBe('File not found');
  });

  it('handles string input', () => {
    const result = cleanErrorMessage('Simple error message');
    expect(result).toBe('Simple error message');
  });

  it('handles nested Error: wrappers', () => {
    const message = "Error: Error: Error: Deep nested error";
    const result = cleanErrorMessage(message);
    // cleanErrorMessage only strips "Error: " twice, so third level remains
    expect(result).toBe('Error: Deep nested error');
  });

  it('strips Error: prefix case-insensitively', () => {
    const result1 = cleanErrorMessage('error: lowercase error');
    expect(result1).toBe('lowercase error');
    
    const result2 = cleanErrorMessage('ERROR: uppercase error');
    expect(result2).toBe('uppercase error');
  });

  it('trims whitespace', () => {
    // Leading whitespace prevents ^ anchor from matching, so Error: isn't stripped
    const result = cleanErrorMessage('   Error: message with spaces   ');
    expect(result).toBe('Error: message with spaces');
  });

  it('returns empty string for empty input', () => {
    const result = cleanErrorMessage('');
    expect(result).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    const result = cleanErrorMessage('   \n  \t  ');
    expect(result).toBe('');
  });

  it('returns empty string for just "Error:"', () => {
    const result = cleanErrorMessage('Error:');
    expect(result).toBe('');
  });

  it('handles multiple "Error invoking remote method" wrappers', () => {
    const message = "Error invoking remote method 'foo': Error invoking remote method 'bar': Actual error";
    const result = cleanErrorMessage(message);
    // Only strips first occurrence of the wrapper pattern
    expect(result).toBe("Error invoking remote method 'bar': Actual error");
  });

  it('preserves error message content after cleaning', () => {
    const message = "Error: Authentication failed: Invalid token";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Authentication failed: Invalid token');
  });

  it('handles real-world Electron IPC error format', () => {
    const message = "Error invoking remote method 'git:commit': Error: Git command failed: nothing to commit";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Git command failed: nothing to commit');
  });

  it('handles non-string, non-Error inputs', () => {
    const result1 = cleanErrorMessage(123);
    expect(result1).toBe('123');
    
    const result2 = cleanErrorMessage(null);
    expect(result2).toBe('null');
    
    const result3 = cleanErrorMessage(undefined);
    expect(result3).toBe('undefined');
  });

  it('handles Error objects with custom messages', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    
    const error = new CustomError('Custom error occurred');
    const result = cleanErrorMessage(error);
    expect(result).toBe('Custom error occurred');
  });

  it('handles errors with colons in the actual message', () => {
    const message = "Error: Failed to connect: ECONNREFUSED: Connection refused";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Failed to connect: ECONNREFUSED: Connection refused');
  });

  it('handles mixed case in remote method wrapper', () => {
    const message = "error invoking remote method 'test': ERROR: Test failed";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Test failed');
  });

  it('preserves meaningful whitespace in error message', () => {
    const message = "Error: Line 1\n  Line 2\n  Line 3";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Line 1\n  Line 2\n  Line 3');
  });

  it('handles error with quotes in channel name', () => {
    const message = "Error invoking remote method 'agent:send-message': Error: Timeout";
    const result = cleanErrorMessage(message);
    expect(result).toBe('Timeout');
  });

  it('handles error without channel name in wrapper', () => {
    const message = "Error invoking remote method '': Error: Some error";
    const result = cleanErrorMessage(message);
    // The regex [^']+ requires at least one non-quote char, so empty channel name doesn't match
    // No stripping occurs, only trimming
    expect(result).toBe("Error invoking remote method '': Error: Some error");
  });
});
