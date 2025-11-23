import * as vscode from 'vscode';
import { Storage } from './storage';
import { GitOperations } from './gitOperations';
import { HunkManager } from './hunkManager';
import { SpaceManager } from './spaceManager';
import { SpaceTreeProvider } from './ui/spaceTreeProvider';
import { HunkDecorationProvider } from './ui/hunkDecorationProvider';
import { HunkCodeLensProvider } from './ui/hunkCodeLensProvider';
import { Commands } from './commands';

let hunkManager: HunkManager | undefined;
let spaceManager: SpaceManager | undefined;
let decorationProvider: HunkDecorationProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Git Spaces extension is now active');

    // Check if we have a workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('Git Spaces requires an open workspace folder');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // Initialize Git operations
    const gitOps = new GitOperations(workspaceRoot);

    // Check if it's a Git repository
    const isGitRepo = await gitOps.isGitRepository();
    if (!isGitRepo) {
        vscode.window.showWarningMessage('Git Spaces requires a Git repository. Please initialize Git first.');
        return;
    }

    // Initialize storage
    const storage = new Storage(context, workspaceRoot);

    // Initialize managers
    hunkManager = new HunkManager(gitOps, storage, workspaceRoot);
    spaceManager = new SpaceManager(storage, hunkManager, gitOps);

    await hunkManager.initialize();
    await spaceManager.initialize();

    // Check for unassigned hunks (from existing uncommitted changes)
    const unassignedHunks = hunkManager.getUnassignedHunks();
    if (unassignedHunks.length > 0) {
        const choice = await vscode.window.showInformationMessage(
            `Found ${unassignedHunks.length} uncommitted change(s). What would you like to do?`,
            'Leave Unassigned',
            'Create New Space'
        );

        if (choice === 'Create New Space') {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter space name (potentially the name for a future branch) ',
                placeHolder: 'e.g. feature-X, bug-fix, refactoring',
            });

            if (name) {
                const goal = await vscode.window.showInputBox({
                    prompt: 'Enter space goal',
                    placeHolder: 'What were you working on?',
                });

                const newSpace = await spaceManager.createSpace(
                    name,
                    goal || 'Existing uncommitted changes',
                    'temporary'
                );

                for (const hunk of unassignedHunks) {
                    await hunkManager.assignHunkToSpace(hunk.id, newSpace.id);
                }

                vscode.window.showInformationMessage(`Created space "${name}" with ${unassignedHunks.length} change(s)`);
            }
        }
    }

    // Register tree view
    const treeProvider = new SpaceTreeProvider(spaceManager, hunkManager);
    const treeView = vscode.window.createTreeView('gitSpacesView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
        dragAndDropController: treeProvider,
        canSelectMany: true
    });
    context.subscriptions.push(treeView);


    // Register CodeLens provider
    const codeLensProvider = new HunkCodeLensProvider(hunkManager, spaceManager);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
    );

    // Register decoration provider
    decorationProvider = new HunkDecorationProvider(hunkManager, spaceManager);

    // Register commands
    const commands = new Commands(spaceManager, hunkManager);
    commands.registerCommands(context);

    vscode.window.showInformationMessage('Git Spaces is ready!');
}

export function deactivate() {
    if (hunkManager) {
        hunkManager.dispose();
    }
    if (spaceManager) {
        spaceManager.dispose();
    }
    if (decorationProvider) {
        decorationProvider.dispose();
    }
}
