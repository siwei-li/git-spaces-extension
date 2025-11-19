import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import * as path from 'path';
import { Hunk } from './types';

export class GitOperations {
    private git: SimpleGit;

    constructor(private workspaceRoot: string) {
        this.git = simpleGit(workspaceRoot);
    }

    async isGitRepository(): Promise<boolean> {
        try {
            await this.git.status();
            return true;
        } catch {
            return false;
        }
    }

    async getCurrentBranch(): Promise<string> {
        const status = await this.git.status();
        return status.current || 'HEAD';
    }

    async createBranch(branchName: string): Promise<void> {
        await this.git.checkoutLocalBranch(branchName);
    }

    async checkoutBranch(branchName: string): Promise<void> {
        await this.git.checkout(branchName);
    }

    async hasUncommittedChanges(): Promise<boolean> {
        const status = await this.git.status();
        return status.files.length > 0;
    }

    async getChangedFiles(): Promise<string[]> {
        const status = await this.git.status();
        return status.files.map(file => file.path);
    }

    async getDiff(filePath?: string): Promise<string> {
        if (filePath) {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            return await this.git.diff(['HEAD', relativePath]);
        }
        return await this.git.diff(['HEAD']);
    }

    async parseDiffToHunks(diff: string, filePath: string): Promise<Partial<Hunk>[]> {
        const hunks: Partial<Hunk>[] = [];
        const lines = diff.split('\n');

        let currentHunk: Partial<Hunk> | null = null;
        let currentLine = 0;
        let hunkContent: string[] = [];
        let originalContent: string[] = [];

        for (const line of lines) {
            // Parse hunk header: @@ -start,count +start,count @@
            const hunkHeaderMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?(\d*) @@/);

            if (hunkHeaderMatch) {
                // Save previous hunk if exists
                if (currentHunk && hunkContent.length > 0) {
                    currentHunk.content = hunkContent.join('\n');
                    currentHunk.originalContent = originalContent.join('\n');
                    currentHunk.endLine = currentLine;
                    hunks.push(currentHunk);
                }

                // Start new hunk
                const startLine = parseInt(hunkHeaderMatch[2]);
                currentLine = startLine;
                currentHunk = {
                    filePath,
                    startLine,
                    endLine: startLine,
                };
                hunkContent = [];
                originalContent = [];
            } else if (currentHunk) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    hunkContent.push(line.substring(1));
                    currentLine++;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    originalContent.push(line.substring(1));
                } else if (line.startsWith(' ')) {
                    hunkContent.push(line.substring(1));
                    originalContent.push(line.substring(1));
                    currentLine++;
                }
            }
        }

        // Save last hunk
        if (currentHunk && hunkContent.length > 0) {
            currentHunk.content = hunkContent.join('\n');
            currentHunk.originalContent = originalContent.join('\n');
            currentHunk.endLine = currentLine;
            hunks.push(currentHunk);
        }

        return hunks;
    }

    async applyPatch(patch: string): Promise<void> {
        try {
            await this.git.raw('apply', '--whitespace=nowarn', '--', '-', patch);
        } catch (error) {
            console.error('Failed to apply patch:', error);
            throw error;
        }
    }

    async createPatch(hunks: Hunk[]): Promise<string> {
        // Group hunks by file
        const fileHunks = new Map<string, Hunk[]>();
        for (const hunk of hunks) {
            if (!fileHunks.has(hunk.filePath)) {
                fileHunks.set(hunk.filePath, []);
            }
            fileHunks.get(hunk.filePath)!.push(hunk);
        }

        let patch = '';
        for (const [filePath, hunks] of fileHunks) {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            patch += `diff --git a/${relativePath} b/${relativePath}\n`;
            patch += `--- a/${relativePath}\n`;
            patch += `+++ b/${relativePath}\n`;

            for (const hunk of hunks) {
                const originalLines = hunk.originalContent.split('\n');
                const newLines = hunk.content.split('\n');

                patch += `@@ -${hunk.startLine},${originalLines.length} +${hunk.startLine},${newLines.length} @@\n`;

                for (const line of originalLines) {
                    patch += `-${line}\n`;
                }
                for (const line of newLines) {
                    patch += `+${line}\n`;
                }
            }
        }

        return patch;
    }
}
