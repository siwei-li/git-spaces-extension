import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
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

    private async scanExistingChanges(): Promise<void> {
        try {
            // Check if there are any uncommitted changes
            const hasChanges = await this.gitOps.hasUncommittedChanges();
            if (!hasChanges) {
                return;
            }

            // Get all changed files
            const changedFiles = await this.gitOps.getChangedFiles();

            // Detect hunks for each changed file
            for (const filePath of changedFiles) {
                const absolutePath = path.join(this.workspaceRoot, filePath);
                const diff = await this.gitOps.getDiff(absolutePath);

                if (diff) {
                    const parsedHunks = await this.gitOps.parseDiffToHunks(diff, absolutePath);

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
                            };

                            this.hunks.push(hunk);
                        }
                    }
                }
            }

            await this.saveHunks();
            this.onHunksChangedEmitter.fire(this.hunks);
        } catch (error) {
            console.error('Error scanning existing changes:', error);
        }
    }

    private startTracking(): void {
        // Track document changes
        const changeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.uri.scheme === 'file') {
                await this.detectHunksForDocument(event.document);
            }
        });

        // Track document saves
        const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.uri.scheme === 'file') {
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

                const hunk: Hunk = {
                    id: existingHunk?.id || uuidv4(),
                    filePath: parsedHunk.filePath!,
                    startLine: parsedHunk.startLine!,
                    endLine: parsedHunk.endLine!,
                    content: parsedHunk.content!,
                    originalContent: parsedHunk.originalContent!,
                    spaceId: existingHunk?.spaceId || '', // Empty means unassigned
                    timestamp: Date.now(),
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
        return this.hunks.filter(h => h.filePath === filePath);
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
