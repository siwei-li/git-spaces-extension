import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Hunk } from './types';
import { GitOperations } from './gitOperations';
import { Storage } from './storage';

export class HunkManager {
    private hunks: Hunk[] = [];
    private changeListeners: vscode.Disposable[] = [];
    private onHunksChangedEmitter = new vscode.EventEmitter<Hunk[]>();
    public readonly onHunksChanged = this.onHunksChangedEmitter.event;

    constructor(
        private gitOps: GitOperations,
        private storage: Storage,
        private workspaceRoot: string
    ) { }

    async initialize(): Promise<void> {
        this.hunks = await this.storage.loadHunks();
        this.startTracking();

        // Scan for existing uncommitted changes
        await this.scanExistingChanges();
    }

    async scanExistingChanges(): Promise<void> {
        try {
            console.log('[Git Spaces] Scanning for existing changes...');

            // Check if there are any uncommitted changes
            const hasChanges = await this.gitOps.hasUncommittedChanges();
            console.log('[Git Spaces] Has uncommitted changes:', hasChanges);

            if (!hasChanges) {
                return;
            }

            // Get all changed files
            const changedFiles = await this.gitOps.getChangedFiles();
            console.log('[Git Spaces] Changed files:', changedFiles);

            // Detect hunks for each changed file
            for (const filePath of changedFiles) {
                try {
                    const absolutePath = path.join(this.workspaceRoot, filePath);
                    console.log('[Git Spaces] ===== Processing file:', filePath, '=====');
                    console.log('[Git Spaces] Absolute path:', absolutePath);

                    // Determine file status
                    const fileStatus = await this.gitOps.getFileStatus(absolutePath);
                    console.log('[Git Spaces] File status:', fileStatus);

                    // Handle deleted files
                    if (fileStatus === 'deleted') {
                        const exists = this.hunks.find(h => h.filePath === absolutePath);
                        if (!exists) {
                            // Try to get the content from HEAD to show what was deleted
                            const diff = await this.gitOps.getDiff(absolutePath, 'deleted');
                            let deletedContent = '';
                            let lineCount = 1;
                            
                            if (diff) {
                                // Extract deleted lines from diff
                                const lines = diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---'));
                                deletedContent = lines.map(line => line.substring(1)).join('\n');
                                lineCount = deletedContent ? deletedContent.split('\n').length : 1;
                            }
                            
                            const hunk: Hunk = {
                                id: uuidv4(),
                                filePath: absolutePath,
                                startLine: 1,
                                endLine: lineCount,
                                content: '',
                                originalContent: deletedContent || '(deleted file)',
                                spaceId: '',
                                timestamp: Date.now(),
                                status: 'deleted',
                            };
                            this.hunks.push(hunk);
                            console.log('[Git Spaces] ✓ Added deleted file hunk with', lineCount, 'lines');
                        }
                        continue;
                    }

                    // Handle untracked/added files
                    if (fileStatus === 'added') {
                        const exists = this.hunks.find(h => h.filePath === absolutePath);
                        if (!exists) {
                            const fileContent = await this.gitOps.getFileContent(absolutePath);
                            const lineCount = fileContent ? fileContent.split('\n').length : 1;
                            console.log('[Git Spaces] Read new file content:', fileContent.length, 'chars,', lineCount, 'lines');
                            
                            const hunk: Hunk = {
                                id: uuidv4(),
                                filePath: absolutePath,
                                startLine: 1,
                                endLine: lineCount,
                                content: fileContent,
                                originalContent: '',
                                spaceId: '',
                                timestamp: Date.now(),
                                status: 'added',
                            };
                            this.hunks.push(hunk);
                            console.log('[Git Spaces] ✓ Added untracked/new file hunk with', lineCount, 'lines');
                        }
                        continue;
                    }

                    // Handle modified files with diff
                    const diff = await this.gitOps.getDiff(absolutePath, fileStatus || 'modified');
                    console.log('[Git Spaces] Diff result:', diff ? `${diff.length} chars` : 'empty/null');

                    if (diff && diff.trim().length > 0) {
                        console.log('[Git Spaces] Has diff, parsing hunks...');
                        const parsedHunks = await this.gitOps.parseDiffToHunks(diff, absolutePath);
                        console.log('[Git Spaces] Parsed hunks:', parsedHunks.length);

                        for (const parsedHunk of parsedHunks) {
                            // Only add if not already tracked
                            const exists = this.hunks.find(
                                h => h.filePath === parsedHunk.filePath &&
                                    h.startLine === parsedHunk.startLine
                            );

                            if (!exists) {
                                const hunk: Hunk = {
                                    id: uuidv4(),
                                    filePath: parsedHunk.filePath!,
                                    startLine: parsedHunk.startLine!,
                                    endLine: parsedHunk.endLine!,
                                    content: parsedHunk.content!,
                                    originalContent: parsedHunk.originalContent!,
                                    spaceId: '', // Unassigned initially
                                    timestamp: Date.now(),
                                    status: 'modified',
                                };

                                this.hunks.push(hunk);
                                console.log('[Git Spaces] ✓ Added hunk:', hunk.id, 'at lines', hunk.startLine, '-', hunk.endLine);
                            } else {
                                console.log('[Git Spaces] ✗ Hunk already exists, skipping');
                            }
                        }
                    } else {
                        // No diff - create entire file hunk as fallback
                        console.log('[Git Spaces] No diff - creating entire-file hunk');

                        const exists = this.hunks.find(h => h.filePath === absolutePath);
                        if (!exists) {
                            const hunk: Hunk = {
                                id: uuidv4(),
                                filePath: absolutePath,
                                startLine: 1,
                                endLine: 1,
                                content: '(entire file)',
                                originalContent: '',
                                spaceId: '', // Unassigned initially
                                timestamp: Date.now(),
                                status: 'modified',
                            };

                            this.hunks.push(hunk);
                            console.log('[Git Spaces] ✓ Added entire-file hunk for:', absolutePath);
                        } else {
                            console.log('[Git Spaces] ✗ Entire-file hunk already exists, skipping');
                        }
                    }
                } catch (fileError) {
                    console.error('[Git Spaces] Error processing file:', filePath, fileError);
                    // Continue with next file
                }
            }

            console.log('[Git Spaces] Total hunks after scan:', this.hunks.length);
            console.log('[Git Spaces] Hunks:', this.hunks.map(h => ({ file: h.filePath, lines: `${h.startLine}-${h.endLine}`, spaceId: h.spaceId || 'unassigned' })));
            await this.saveHunks();
            this.onHunksChangedEmitter.fire(this.hunks);
        } catch (error) {
            console.error('[Git Spaces] Error scanning existing changes:', error);
        }
    }

    private startTracking(): void {
        // Track document changes
        const changeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.uri.scheme === 'file') {
                console.log('[Git Spaces] Document changed:', event.document.uri.fsPath);
                await this.detectHunksForDocument(event.document);
            }
        });

        // Track document saves
        const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.uri.scheme === 'file') {
                console.log('[Git Spaces] Document saved:', document.uri.fsPath);
                await this.detectHunksForDocument(document);
            }
        });

        this.changeListeners.push(changeListener, saveListener);
    }

    async detectHunksForDocument(document: vscode.TextDocument): Promise<void> {
        const filePath = document.uri.fsPath;

        try {
            const diff = await this.gitOps.getDiff(filePath);
            if (!diff) {
                // No changes, remove hunks for this file
                this.hunks = this.hunks.filter(h => h.filePath !== filePath);
                await this.saveHunks();
                return;
            }

            const parsedHunks = await this.gitOps.parseDiffToHunks(diff, filePath);

            // Remove old hunks for this file
            this.hunks = this.hunks.filter(h => h.filePath !== filePath);

            // Add new hunks (preserve space assignment if hunk exists)
            for (const parsedHunk of parsedHunks) {
                const existingHunk = this.hunks.find(
                    h => h.filePath === parsedHunk.filePath &&
                        h.startLine === parsedHunk.startLine
                );

                const fileStatus = await this.gitOps.getFileStatus(filePath);
                const hunk: Hunk = {
                    id: existingHunk?.id || uuidv4(),
                    filePath: parsedHunk.filePath!,
                    startLine: parsedHunk.startLine!,
                    endLine: parsedHunk.endLine!,
                    content: parsedHunk.content!,
                    originalContent: parsedHunk.originalContent!,
                    spaceId: existingHunk?.spaceId || '', // Empty means unassigned
                    timestamp: Date.now(),
                    status: fileStatus || 'modified',
                };

                this.hunks.push(hunk);
            }

            await this.saveHunks();
            this.onHunksChangedEmitter.fire(this.hunks);
        } catch (error) {
            console.error('Error detecting hunks:', error);
        }
    }

    async assignHunkToSpace(hunkId: string, spaceId: string): Promise<void> {
        const hunk = this.hunks.find(h => h.id === hunkId);
        if (hunk) {
            hunk.spaceId = spaceId;
            hunk.timestamp = Date.now();
            await this.saveHunks();
            this.onHunksChangedEmitter.fire(this.hunks);
        }
    }

    getHunksForSpace(spaceId: string): Hunk[] {
        return this.hunks.filter(h => h.spaceId === spaceId);
    }

    getUnassignedHunks(): Hunk[] {
        return this.hunks.filter(h => !h.spaceId || h.spaceId === '');
    }

    getAllHunks(): Hunk[] {
        return [...this.hunks];
    }

    getHunksForFile(filePath: string): Hunk[] {
        const hunks = this.hunks.filter(h => h.filePath === filePath);
        console.log(`[Git Spaces] getHunksForFile(${filePath}): found ${hunks.length} hunks out of ${this.hunks.length} total`);
        if (this.hunks.length > 0 && hunks.length === 0) {
            console.log('[Git Spaces] Available file paths:', this.hunks.map(h => h.filePath));
        }
        return hunks;
    }

    async applyHunks(hunks: Hunk[]): Promise<void> {
        if (hunks.length === 0) {
            return;
        }

        try {
            const patch = await this.gitOps.createPatch(hunks);
            await this.gitOps.applyPatch(patch);
        } catch (error) {
            console.error('Error applying hunks:', error);
            throw error;
        }
    }

    async unapplyHunks(hunks: Hunk[]): Promise<void> {
        if (hunks.length === 0) {
            return;
        }

        try {
            // To unapply, we reverse the patch (swap content and originalContent)
            const reversedHunks = hunks.map(h => ({
                ...h,
                content: h.originalContent,
                originalContent: h.content,
            }));

            const patch = await this.gitOps.createPatch(reversedHunks);
            await this.gitOps.applyPatch(patch);
        } catch (error) {
            console.error('Error unapplying hunks:', error);
            throw error;
        }
    }

    async reassignHunks(fromSpaceId: string, toSpaceId: string): Promise<void> {
        for (const hunk of this.hunks) {
            if (hunk.spaceId === fromSpaceId) {
                hunk.spaceId = toSpaceId;
            }
        }
        await this.saveHunks();
        this.onHunksChangedEmitter.fire(this.hunks);
    }

    async deleteHunksForSpace(spaceId: string): Promise<void> {
        this.hunks = this.hunks.filter(h => h.spaceId !== spaceId);
        await this.saveHunks();
        this.onHunksChangedEmitter.fire(this.hunks);
    }

    private async saveHunks(): Promise<void> {
        await this.storage.saveHunks(this.hunks);
    }

    dispose(): void {
        this.changeListeners.forEach(listener => listener.dispose());
        this.onHunksChangedEmitter.dispose();
    }
}
