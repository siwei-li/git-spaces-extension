import * as vscode from 'vscode';
import { Space } from '../types';
import { SpaceManager } from '../spaceManager';
import { SpaceTreeItem } from './spaceTreeItem';

export class SpaceTreeProvider implements vscode.TreeDataProvider<Space> {
    private _onDidChangeTreeData = new vscode.EventEmitter<Space | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private spaceManager: SpaceManager) {
        // Listen to space changes
        spaceManager.onSpacesChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Space): vscode.TreeItem {
        // Active space is expanded, others are collapsed
        const collapsibleState = element.isActive
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;

        return new SpaceTreeItem(element, collapsibleState);
    }

    getChildren(element?: Space): Thenable<Space[]> {
        if (!element) {
            // Root level - return all spaces
            return Promise.resolve(this.spaceManager.listSpaces());
        }
        // Spaces don't have children
        return Promise.resolve([]);
    }

    getParent(element: Space): vscode.ProviderResult<Space> {
        return null;
    }
}
