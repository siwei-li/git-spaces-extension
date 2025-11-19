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
    const storage = new Storage(context);

    // Initialize managers
    hunkManager = new HunkManager(gitOps, storage, workspaceRoot);
    spaceManager = new SpaceManager(storage, hunkManager, gitOps);

    await hunkManager.initialize();
    await spaceManager.initialize();

    // Register tree view
    const treeProvider = new SpaceTreeProvider(spaceManager);
    const treeView = vscode.window.createTreeView('gitSpacesView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
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
