import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Space } from './types';
import { Storage } from './storage';
import { HunkManager } from './hunkManager';
import { GitOperations } from './gitOperations';

export class SpaceManager {
    private spaces: Space[] = [];
    private onSpacesChangedEmitter = new vscode.EventEmitter<Space[]>();
    public readonly onSpacesChanged = this.onSpacesChangedEmitter.event;

    constructor(
        private storage: Storage,
        private hunkManager: HunkManager,
        private gitOps: GitOperations
    ) { }

    async initialize(): Promise<void> {
        this.spaces = await this.storage.loadSpaces();

        // Ensure at least one space exists
        if (this.spaces.length === 0) {
            await this.createSpace(
                'Main',
                'Default workspace',
                'temporary'
            );
        }
    }

    async createSpace(
        name: string,
        goal: string,
        type: 'branch' | 'temporary',
        branchName?: string
    ): Promise<Space> {
        // For branch-type spaces, use the branch name as the space name
        const spaceName = type === 'branch' && branchName ? branchName : name;
        
        const space: Space = {
            id: uuidv4(),
            name: spaceName,
            goal,
            type,
            branchName: type === 'branch' ? branchName : undefined,
            createdAt: Date.now(),
            lastModified: Date.now(),
        };

        this.spaces.push(space);
        await this.saveSpaces();
        this.onSpacesChangedEmitter.fire(this.spaces);

        return space;
    }

    async switchSpace(spaceId: string): Promise<void> {
        const targetSpace = this.spaces.find(s => s.id === spaceId);
        if (!targetSpace) {
            throw new Error('Space not found');
        }

        // Switch branch if needed
        if (targetSpace.type === 'branch' && targetSpace.branchName) {
            try {
                await this.gitOps.checkoutBranch(targetSpace.branchName);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to checkout branch: ${error}`);
                return;
            }
        }

        // Apply target space hunks
        const targetHunks = this.hunkManager.getHunksForSpace(spaceId);
        if (targetHunks.length > 0) {
            try {
                await this.hunkManager.applyHunks(targetHunks);
            } catch (error) {
                // Use "last applied wins" - if there's a conflict, we continue
                console.warn('Conflict applying hunks, using last applied wins:', error);
            }
        }

        targetSpace.lastModified = Date.now();
        await this.saveSpaces();
        this.onSpacesChangedEmitter.fire(this.spaces);

        vscode.window.showInformationMessage(`Switched to space: ${targetSpace.name}`);
    }

    async deleteSpace(spaceId: string): Promise<void> {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) {
            return;
        }

        // Ask what to do with hunks
        const hunks = this.hunkManager.getHunksForSpace(spaceId);
        if (hunks.length > 0) {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'Discard Changes', value: 'discard' },
                    { label: 'Move to Another Space', value: 'move' },
                ],
                { placeHolder: 'This space has uncommitted changes. What would you like to do?' }
            );

            if (!choice) {
                return; // User cancelled
            }

            if (choice.value === 'move') {
                const otherSpaces = this.spaces.filter(s => s.id !== spaceId);
                const targetSpace = await vscode.window.showQuickPick(
                    otherSpaces.map(s => ({ label: s.name, space: s })),
                    { placeHolder: 'Select space to move changes to' }
                );

                if (targetSpace) {
                    await this.hunkManager.reassignHunks(spaceId, targetSpace.space.id);
                } else {
                    return; // User cancelled
                }
            } else {
                await this.hunkManager.deleteHunksForSpace(spaceId);
            }
        }

        this.spaces = this.spaces.filter(s => s.id !== spaceId);
        await this.saveSpaces();
        this.onSpacesChangedEmitter.fire(this.spaces);

        vscode.window.showInformationMessage(`Deleted space: ${space.name}`);
    }

    async updateSpaceGoal(spaceId: string, goal: string): Promise<void> {
        const space = this.spaces.find(s => s.id === spaceId);
        if (space) {
            space.goal = goal;
            space.lastModified = Date.now();
            await this.saveSpaces();
            this.onSpacesChangedEmitter.fire(this.spaces);
        }
    }

    async toggleSpaceType(spaceId: string): Promise<void> {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) {
            throw new Error('Space not found');
        }

        if (space.type === 'temporary') {
            // Convert to branch
            const branchName = await vscode.window.showInputBox({
                prompt: 'Enter branch name for this space',
                placeHolder: 'e.g., feature/my-feature',
                value: space.name.toLowerCase().replace(/\s+/g, '-'),
            });

            if (!branchName) {
                return; // User cancelled
            }

            // Check if branch exists
            const branchExists = await this.gitOps.branchExists(branchName);
            if (!branchExists) {
                // Create the branch
                try {
                    await this.gitOps.createBranch(branchName);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
                    return;
                }
            }

            space.type = 'branch';
            space.branchName = branchName;
            space.name = branchName; // Sync space name with branch name
            vscode.window.showInformationMessage(`Converted "${branchName}" to branch space`);
        } else {
            // Convert to temporary
            const confirm = await vscode.window.showWarningMessage(
                `Convert "${space.name}" to temporary space? The branch "${space.branchName}" will remain but won't be tracked.`,
                { modal: true },
                'Convert'
            );

            if (confirm !== 'Convert') {
                return;
            }

            space.type = 'temporary';
            space.branchName = undefined;
            vscode.window.showInformationMessage(`Converted "${space.name}" to temporary space`);
        }

        space.lastModified = Date.now();
        await this.saveSpaces();
        this.onSpacesChangedEmitter.fire(this.spaces);
    }

    async stageSpace(spaceId: string): Promise<void> {
        console.log('[Git Spaces] stageSpace called with spaceId:', spaceId);
        console.log('[Git Spaces] Current spaces:', this.spaces.map(s => ({ id: s.id, name: s.name })));

        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) {
            console.error('[Git Spaces] Space not found:', spaceId);
            console.error('[Git Spaces] Available space IDs:', this.spaces.map(s => s.id));
            throw new Error('Space not found');
        }
        console.log('[Git Spaces] Found space:', space.name, 'type:', space.type);

        const hunks = this.hunkManager.getHunksForSpace(spaceId);
        console.log('[Git Spaces] Found hunks:', hunks.length);

        if (hunks.length === 0) {
            vscode.window.showInformationMessage('No changes to stage in this space');
            return;
        }

        try {
            // Get unique list of files that have hunks in this space
            const filesToStage = [...new Set(hunks.map(h => h.filePath))];
            console.log('[Git Spaces] Files to stage:', filesToStage);

            if (space.type === 'branch') {
                // For branch spaces: checkout the branch, stage files, and commit
                if (!space.branchName) {
                    throw new Error('Branch space has no branch name');
                }

                console.log('[Git Spaces] Checking out branch:', space.branchName);
                await this.gitOps.checkoutBranch(space.branchName);

                console.log('[Git Spaces] Staging files...');
                await this.gitOps.stageFiles(filesToStage);

                const commitMessage = await vscode.window.showInputBox({
                    prompt: `Commit message for ${space.branchName}`,
                    placeHolder: 'Enter commit message',
                    value: space.goal,
                });

                if (!commitMessage) {
                    vscode.window.showWarningMessage('Commit cancelled');
                    return;
                }

                console.log('[Git Spaces] Committing changes...');
                await this.gitOps.commit(commitMessage);

                // Remove hunks for this space since they're now committed
                console.log('[Git Spaces] Removing hunks for committed files...');
                await this.hunkManager.deleteHunksForSpace(spaceId);
                
                // Rescan to pick up any remaining changes
                console.log('[Git Spaces] Rescanning for remaining changes...');
                await this.hunkManager.scanExistingChanges();

                vscode.window.showInformationMessage(`Committed ${filesToStage.length} file(s) to branch "${space.branchName}"`);
            } else {
                // For temporary spaces: just stage the changes
                console.log('[Git Spaces] Staging files for temporary space...');
                await this.gitOps.stageFiles(filesToStage);

                // Remove hunks for this space since they're now staged
                console.log('[Git Spaces] Removing hunks for staged files...');
                await this.hunkManager.deleteHunksForSpace(spaceId);
                
                // Rescan to pick up any remaining changes
                console.log('[Git Spaces] Rescanning for remaining changes...');
                await this.hunkManager.scanExistingChanges();

                vscode.window.showInformationMessage(`Staged ${filesToStage.length} file(s) from "${space.name}"`);
            }
        } catch (error) {
            console.error('[Git Spaces] Staging failed:', error);
            vscode.window.showErrorMessage(`Failed to stage: ${error}`);
        }
    }

    listSpaces(): Space[] {
        return [...this.spaces];
    }



    getSpace(spaceId: string): Space | undefined {
        return this.spaces.find(s => s.id === spaceId);
    }

    private async saveSpaces(): Promise<void> {
        await this.storage.saveSpaces(this.spaces);
    }

    dispose(): void {
        this.onSpacesChangedEmitter.dispose();
    }
}
