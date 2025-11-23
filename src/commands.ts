import * as vscode from 'vscode';
import { SpaceManager } from './spaceManager';
import { HunkManager } from './hunkManager';

export class Commands {
    constructor(
        private spaceManager: SpaceManager,
        private hunkManager: HunkManager
    ) { }

    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('gitSpaces.createSpace', () => this.createSpace()),
            vscode.commands.registerCommand('gitSpaces.switchSpace', (space) => this.switchSpace(space)),
            vscode.commands.registerCommand('gitSpaces.deleteSpace', (space) => this.deleteSpace(space)),
            vscode.commands.registerCommand('gitSpaces.editGoal', (space) => this.editGoal(space)),
            vscode.commands.registerCommand('gitSpaces.renameSpace', (space) => this.renameSpace(space)),
            vscode.commands.registerCommand('gitSpaces.toggleSpaceType', (space) => this.toggleSpaceType(space)),
            vscode.commands.registerCommand('gitSpaces.stageSpace', (space) => this.stageSpace(space)),
            vscode.commands.registerCommand('gitSpaces.assignHunkToSpace', (hunkId, spaceId) =>
                this.assignHunkToSpace(hunkId, spaceId)
            ),
            vscode.commands.registerCommand('gitSpaces.assignHunkToExistingSpace', (item) =>
                this.assignHunkToExistingSpace(item)
            ),
            vscode.commands.registerCommand('gitSpaces.assignHunkToNewSpace', (hunkId) =>
                this.assignHunkToNewSpace(hunkId)
            ),
            vscode.commands.registerCommand('gitSpaces.goToHunk', (hunk) => this.goToHunk(hunk)),
            vscode.commands.registerCommand('gitSpaces.discardHunk', (item) => this.discardHunk(item)),
            vscode.commands.registerCommand('gitSpaces.refreshSpaces', () => this.refreshSpaces()),
            vscode.commands.registerCommand('gitSpaces.rescanChanges', () => this.rescanChanges())
        );
    }


    private async createSpace(): Promise<void> {
        // Get space name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter space name',
            placeHolder: 'e.g., Feature X, Bug Fix, Refactoring',
        });

        if (!name) {
            return;
        }

        // Get space goal (optional)
        const goal = await vscode.window.showInputBox({
            prompt: 'Enter space goal/agenda (optional)',
            placeHolder: 'What are you working on in this space? (defaults to space name)',
        });

        const finalGoal = goal && goal.trim() !== '' ? goal : name;

        // Get space type
        const typeChoice = await vscode.window.showQuickPick(
            [
                { label: 'Temporary', value: 'temporary', description: 'Just for organizing changes' },
                { label: 'Branch', value: 'branch', description: 'Associated with a Git branch' },
            ],
            { placeHolder: 'Select space type' }
        );

        if (!typeChoice) {
            return;
        }

        let branchName: string | undefined;
        if (typeChoice.value === 'branch') {
            branchName = await vscode.window.showInputBox({
                prompt: 'Enter branch name',
                placeHolder: 'e.g., feature/new-feature',
            });

            if (!branchName) {
                return;
            }
        }

        // Create the space
        const space = await this.spaceManager.createSpace(
            name,
            finalGoal,
            typeChoice.value as 'branch' | 'temporary',
            branchName
        );

        // Ask about unassigned hunks
        const unassignedHunks = this.hunkManager.getUnassignedHunks();
        if (unassignedHunks.length > 0) {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'Assign to New Space', value: 'assign' },
                    { label: 'Leave Unassigned', value: 'leave' },
                ],
                { placeHolder: `You have ${unassignedHunks.length} unassigned hunk(s). What would you like to do?` }
            );

            if (choice?.value === 'assign') {
                for (const hunk of unassignedHunks) {
                    await this.hunkManager.assignHunkToSpace(hunk.id, space.id);
                }
            }
        }

        vscode.window.showInformationMessage(`Created space: ${name}`);
    }

    private async switchSpace(item?: any): Promise<void> {
        let spaceId: string;

        if (item && item.space) {
            spaceId = item.space.id;
        } else {
            // Show quick pick
            const spaces = this.spaceManager.listSpaces();
            const choice = await vscode.window.showQuickPick(
                spaces.map(s => ({
                    label: s.name,
                    description: s.goal,
                    space: s,
                })),
                { placeHolder: 'Select space to switch to' }
            );

            if (!choice) {
                return;
            }

            spaceId = choice.space.id;
        }

        await this.spaceManager.switchSpace(spaceId);
    }

    private async deleteSpace(item?: any): Promise<void> {
        let spaceId: string;
        let space;

        // Try to extract space ID from various sources
        if (item?.space?.id) {
            // Called from tree view with SpaceTreeItem
            spaceId = item.space.id;
            space = item.space;
        } else if (item?.id) {
            // Called with Space object directly
            spaceId = item.id;
            space = item;
        } else {
            // Show quick pick only if no space was provided
            const spaces = this.spaceManager.listSpaces();
            const choice = await vscode.window.showQuickPick(
                spaces.map(s => ({
                    label: s.name,
                    description: s.goal,
                    space: s,
                })),
                { placeHolder: 'Select space to delete' }
            );

            if (!choice) {
                return;
            }

            spaceId = choice.space.id;
            space = choice.space;
        }

        if (!space) {
            space = this.spaceManager.getSpace(spaceId);
            if (!space) {
                return;
            }
        }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete space "${space.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            await this.spaceManager.deleteSpace(spaceId);
        }
    }

    private async editGoal(item?: any): Promise<void> {
        let spaceId: string;
        let currentGoal: string;

        if (item && item.space) {
            spaceId = item.space.id;
            currentGoal = item.space.goal;
        } else {
            // Show quick pick
            const spaces = this.spaceManager.listSpaces();
            const choice = await vscode.window.showQuickPick(
                spaces.map(s => ({
                    label: s.name,
                    description: s.goal,
                    space: s,
                })),
                { placeHolder: 'Select space to edit goal' }
            );

            if (!choice) {
                return;
            }

            spaceId = choice.space.id;
            currentGoal = choice.space.goal;
        }

        const newGoal = await vscode.window.showInputBox({
            prompt: 'Enter new goal',
            value: currentGoal,
        });

        if (newGoal !== undefined && newGoal !== currentGoal) {
            await this.spaceManager.updateSpaceGoal(spaceId, newGoal);
            vscode.window.showInformationMessage('Goal updated');
        }
    }

    private async renameSpace(item?: any): Promise<void> {
        let spaceId: string;
        let space;

        // Try to extract space from various sources
        if (item?.space?.id) {
            spaceId = item.space.id;
            space = item.space;
        } else if (item?.id) {
            spaceId = item.id;
            space = item;
        } else {
            // Show quick pick
            const spaces = this.spaceManager.listSpaces();
            const choice = await vscode.window.showQuickPick(
                spaces.map(s => ({
                    label: s.name,
                    description: s.goal,
                    space: s,
                })),
                { placeHolder: 'Select space to rename' }
            );

            if (!choice) {
                return;
            }

            spaceId = choice.space.id;
            space = choice.space;
        }

        if (!space) {
            space = this.spaceManager.getSpace(spaceId);
            if (!space) {
                return;
            }
        }

        // Don't allow renaming branch-type spaces
        if (space.type === 'branch') {
            vscode.window.showWarningMessage('Cannot rename branch-type spaces. The space name matches the branch name.');
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new space name',
            value: space.name,
        });

        if (newName && newName !== space.name) {
            await this.spaceManager.renameSpace(spaceId, newName);
            vscode.window.showInformationMessage(`Renamed space to "${newName}"`);
        }
    }

    private async assignHunkToSpace(hunkId: string, spaceId: string): Promise<void> {
        await this.hunkManager.assignHunkToSpace(hunkId, spaceId);
        const space = this.spaceManager.getSpace(spaceId);
        if (space) {
            vscode.window.showInformationMessage(`Assigned hunk to: ${space.name}`);
        }
    }

    private async assignHunkToExistingSpace(item?: any): Promise<void> {
        let hunk;
        
        // Extract hunk from the item
        if (item?.hunk) {
            hunk = item.hunk;
        } else if (item?.id) {
            // Get hunk by ID from hunk manager
            hunk = this.hunkManager.getAllHunks().find(h => h.id === item.id);
        } else {
            vscode.window.showErrorMessage('No hunk selected');
            return;
        }

        if (!hunk) {
            vscode.window.showErrorMessage('Hunk not found');
            return;
        }

        // Show quick pick of existing spaces
        const spaces = this.spaceManager.listSpaces();
        const choice = await vscode.window.showQuickPick(
            spaces.map(s => ({
                label: s.name,
                description: s.goal,
                detail: `${s.type === 'branch' ? '🌿 Branch' : '📁 Temporary'}`,
                space: s,
            })),
            { placeHolder: 'Select space to assign hunk to' }
        );

        if (!choice) {
            return;
        }

        await this.hunkManager.assignHunkToSpace(hunk.id, choice.space.id);
        vscode.window.showInformationMessage(`Assigned to: ${choice.space.name}`);
    }

    private async assignHunkToNewSpace(item?: any): Promise<void> {
        let hunk;
        
        // Extract hunk from the item or use the passed hunkId for backward compatibility
        if (typeof item === 'string') {
            // Old style: just hunkId passed
            hunk = this.hunkManager.getAllHunks().find(h => h.id === item);
        } else if (item?.hunk) {
            hunk = item.hunk;
        } else if (item?.id) {
            hunk = this.hunkManager.getAllHunks().find(h => h.id === item.id);
        } else {
            vscode.window.showErrorMessage('No hunk selected');
            return;
        }

        if (!hunk) {
            vscode.window.showErrorMessage('Hunk not found');
            return;
        }

        // Get space name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter new space name',
            placeHolder: 'e.g., Feature X, Bug Fix',
        });

        if (!name) {
            return;
        }

        // Get space goal (optional)
        const goal = await vscode.window.showInputBox({
            prompt: 'Enter space goal (optional)',
            placeHolder: 'What are you working on? (defaults to space name)',
        });

        // Create temporary space by default for quick assignment
        const space = await this.spaceManager.createSpace(
            name,
            goal && goal.trim() !== '' ? goal : name,
            'temporary'
        );
        await this.hunkManager.assignHunkToSpace(hunk.id, space.id);

        vscode.window.showInformationMessage(`Created space "${name}" and assigned hunk`);
    }

    private async goToHunk(hunk: any): Promise<void> {
        const uri = vscode.Uri.file(hunk.filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        // Navigate to the hunk's start line
        const position = new vscode.Position(hunk.startLine - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    }

    private async discardHunk(item?: any): Promise<void> {
        let hunk;
        
        // Extract hunk from the item
        if (item?.hunk) {
            hunk = item.hunk;
        } else if (item?.id) {
            // Get hunk by ID from hunk manager
            hunk = this.hunkManager.getAllHunks().find(h => h.id === item.id);
        } else {
            vscode.window.showErrorMessage('No hunk selected');
            return;
        }

        if (!hunk) {
            vscode.window.showErrorMessage('Hunk not found');
            return;
        }

        const fileName = require('path').basename(hunk.filePath);
        let message = `Discard changes in ${fileName}`;
        
        if (hunk.status === 'added') {
            message = `Delete untracked file ${fileName}?`;
        } else if (hunk.status === 'deleted') {
            message = `Restore deleted file ${fileName}?`;
        } else if (hunk.status === 'modified') {
            message = `Discard all changes in ${fileName}?`;
        }

        const confirm = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Discard'
        );

        if (confirm === 'Discard') {
            try {
                await this.hunkManager.removeHunk(hunk.id, true);
                vscode.window.showInformationMessage(`Changes discarded for ${fileName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to discard changes: ${error}`);
            }
        }
    }

    private async refreshSpaces(): Promise<void> {
        vscode.window.showInformationMessage('Refreshing spaces and rescanning changes...');
        await this.hunkManager.scanExistingChanges();
        const unassignedCount = this.hunkManager.getUnassignedHunks().length;
        const totalCount = this.hunkManager.getAllHunks().length;
        vscode.window.showInformationMessage(`Refreshed! Found ${totalCount} total hunks (${unassignedCount} unassigned)`);
    }

    private async rescanChanges(): Promise<void> {
        vscode.window.showInformationMessage('Rescanning for changes...');
        await this.hunkManager.scanExistingChanges();
        const unassignedCount = this.hunkManager.getUnassignedHunks().length;
        const totalCount = this.hunkManager.getAllHunks().length;
        vscode.window.showInformationMessage(`Found ${totalCount} total hunks (${unassignedCount} unassigned)`);
    }

    private async toggleSpaceType(item?: any): Promise<void> {
        let spaceId: string;

        // Try to extract space ID from various sources
        if (item?.space?.id) {
            // Called from tree view with SpaceTreeItem
            spaceId = item.space.id;
        } else if (item?.id) {
            // Called with Space object directly
            spaceId = item.id;
        } else {
            // Show quick pick
            const spaces = this.spaceManager.listSpaces();
            const choice = await vscode.window.showQuickPick(
                spaces.map(s => ({
                    label: s.name,
                    description: `${s.type} - ${s.goal}`,
                    space: s,
                })),
                { placeHolder: 'Select space to toggle type' }
            );

            if (!choice) {
                return;
            }

            spaceId = choice.space.id;
        }

        await this.spaceManager.toggleSpaceType(spaceId);
    }

    private async stageSpace(item?: any): Promise<void> {
        console.log('[Git Spaces] stageSpace called with:', item);
        console.log('[Git Spaces] item type:', typeof item);
        console.log('[Git Spaces] item.space:', item?.space);
        console.log('[Git Spaces] item.id:', item?.id);

        let spaceId: string | undefined;

        // Try to extract space ID from various sources
        if (item?.space?.id) {
            // Called from tree view with SpaceTreeItem
            spaceId = item.space.id;
            console.log('[Git Spaces] Extracted spaceId from item.space.id:', spaceId);
        } else if (item?.id) {
            // Called with Space object directly
            spaceId = item.id;
            console.log('[Git Spaces] Extracted spaceId from item.id:', spaceId);
        } else {
            // Show quick pick
            console.log('[Git Spaces] No item provided, showing quick pick');
            const spaces = this.spaceManager.listSpaces();
            const choice = await vscode.window.showQuickPick(
                spaces.map(s => ({
                    label: s.name,
                    description: s.goal,
                    space: s,
                })),
                { placeHolder: 'Select space to stage' }
            );

            if (!choice) {
                return;
            }

            spaceId = choice.space.id;
            console.log('[Git Spaces] Extracted spaceId from choice:', spaceId);
        }

        if (!spaceId) {
            vscode.window.showErrorMessage('Could not determine space ID');
            console.error('[Git Spaces] spaceId is undefined!');
            return;
        }

        // Don't allow staging the virtual "Unassigned" space
        if (spaceId === '__unassigned__') {
            vscode.window.showWarningMessage('Cannot stage the Unassigned section. Please assign hunks to a space first.');
            return;
        }

        console.log('[Git Spaces] Calling stageSpace with spaceId:', spaceId);
        try {
            await this.spaceManager.stageSpace(spaceId);
        } catch (error) {
            console.error('[Git Spaces] Error in stageSpace:', error);
            vscode.window.showErrorMessage(`Failed to stage space: ${error}`);
        }
    }
}
