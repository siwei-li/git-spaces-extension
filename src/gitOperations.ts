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

    async branchExists(branchName: string): Promise<boolean> {
        try {
            const branches = await this.git.branch();
            return branches.all.includes(branchName);
        } catch {
            return false;
        }
    }

    async checkoutBranch(branchName: string): Promise<void> {
        await this.git.checkout(branchName);
    }

    async discardChanges(filePath: string, isUntracked: boolean = false): Promise<void> {
        console.log('[Git Spaces] Discarding changes for:', filePath, 'isUntracked:', isUntracked);
        
        if (isUntracked) {
            // Delete untracked file directly (don't use git)
            const fs = require('fs').promises;
            try {
                await fs.unlink(filePath);
                console.log('[Git Spaces] Successfully deleted untracked file:', filePath);
            } catch (error) {
                console.error('[Git Spaces] Error deleting untracked file:', error);
                throw error;
            }
        } else {
            // Restore file to HEAD state (discards modifications and deletions)
            const relativePath = path.relative(this.workspaceRoot, filePath);
            console.log('[Git Spaces] Restoring file to HEAD:', relativePath);
            await this.git.raw(['restore', '--', relativePath]);
        }
    }

    async stageAll(): Promise<void> {
        await this.git.add('.');
    }

    async stageFiles(files: string[]): Promise<void> {
        if (files.length === 0) {
            return;
        }
        // Convert absolute paths to relative paths
        const relativePaths = files.map(f => path.relative(this.workspaceRoot, f));
        await this.git.add(relativePaths);
    }

    async commit(message: string): Promise<void> {
        await this.git.commit(message);
    }

    async hasUncommittedChanges(): Promise<boolean> {
        const status = await this.git.status();
        return status.files.length > 0;
    }

    async getChangedFiles(): Promise<string[]> {
        const status = await this.git.status();
        console.log('[Git Spaces] Git status result:', {
            files: status.files.map(f => ({ path: f.path, index: f.index, working_dir: f.working_dir })),
            not_added: status.not_added,
            deleted: status.deleted,
            modified: status.modified,
            created: status.created
        });
        return status.files.map(file => file.path);
    }

    async getFileStatus(filePath: string): Promise<'added' | 'deleted' | 'modified' | null> {
        const status = await this.git.status();
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const fileStatus = status.files.find(f => f.path === relativePath);
        
        if (!fileStatus) {
            return null;
        }

        // Check if file is deleted
        if (fileStatus.working_dir === 'D' || status.deleted.includes(relativePath)) {
            return 'deleted';
        }
        
        // Check if file is untracked/added
        if (fileStatus.working_dir === '?' || status.not_added.includes(relativePath) || status.created.includes(relativePath)) {
            return 'added';
        }
        
        // Otherwise it's modified
        return 'modified';
    }

    async getDiff(filePath?: string, status?: 'added' | 'deleted' | 'modified'): Promise<string> {
        if (filePath) {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            
            // For deleted files, show the diff from HEAD (what was deleted)
            if (status === 'deleted') {
                return await this.git.diff(['HEAD', '--', relativePath]);
            }
            
            // For untracked/added files, show diff against empty (no HEAD version)
            if (status === 'added') {
                // Show the entire file as added content
                return await this.git.diff(['--no-index', '/dev/null', relativePath]).catch(() => '');
            }
            
            // For modified files, normal diff
            return await this.git.diff(['HEAD', '--', relativePath]);
        }
        return await this.git.diff(['HEAD']);
    }

    async getFileContent(filePath: string): Promise<string> {
        const fs = require('fs').promises;
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            console.error('Error reading file:', error);
            return '';
        }
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
