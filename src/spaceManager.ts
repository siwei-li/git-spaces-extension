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
            const defaultSpace = await this.createSpace(
                'Main',
                'Default workspace',
                'temporary'
            );
            defaultSpace.isActive = true;
            await this.saveSpaces();
        }

        // Restore active space
        const activeSpaceId = await this.storage.loadActiveSpaceId();
        if (activeSpaceId) {
            const activeSpace = this.spaces.find(s => s.id === activeSpaceId);
            if (activeSpace) {
                await this.switchSpace(activeSpace.id);
            }
        }
    }

    async createSpace(
        name: string,
        goal: string,
        type: 'branch' | 'temporary',
        branchName?: string
    ): Promise<Space> {
        const space: Space = {
            id: uuidv4(),
            name,
            goal,
            type,
            branchName,
            isActive: false,
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

        const currentSpace = this.getActiveSpace();

        // Unapply current space hunks
        if (currentSpace) {
            const currentHunks = this.hunkManager.getHunksForSpace(currentSpace.id);
            if (currentHunks.length > 0) {
                try {
                    await this.hunkManager.unapplyHunks(currentHunks);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to save current space changes: ${error}`);
                    return;
                }
            }
            currentSpace.isActive = false;
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

        targetSpace.isActive = true;
        targetSpace.lastModified = Date.now();

        await this.saveSpaces();
        await this.storage.saveActiveSpaceId(spaceId);
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

        // If deleting active space, switch to another
        if (space.isActive && this.spaces.length > 1) {
            const otherSpace = this.spaces.find(s => s.id !== spaceId);
            if (otherSpace) {
                await this.switchSpace(otherSpace.id);
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

    listSpaces(): Space[] {
        return [...this.spaces];
    }

    getActiveSpace(): Space | undefined {
        return this.spaces.find(s => s.isActive);
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
