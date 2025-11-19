import * as vscode from 'vscode';
import { Space, Hunk } from '../types';
import { SpaceManager } from '../spaceManager';
import { HunkManager } from '../hunkManager';
import { SpaceTreeItem } from './spaceTreeItem';
import { HunkTreeItem } from './hunkTreeItem';

type TreeElement = Space | Hunk;

export class SpaceTreeProvider implements vscode.TreeDataProvider<TreeElement> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private spaceManager: SpaceManager,
        private hunkManager: HunkManager
    ) {
        // Listen to space changes
        spaceManager.onSpacesChanged(() => {
            this.refresh();
        });

        // Listen to hunk changes
        hunkManager.onHunksChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeElement): vscode.TreeItem {
        // Check if it's a Space or Hunk
        if ('goal' in element) {
            // It's a Space
            const space = element as Space;
            const hunkCount = this.hunkManager.getHunksForSpace(space.id).length;

            // Active space is expanded, others are collapsed
            const collapsibleState = hunkCount > 0
                ? (space.isActive
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed)
                : vscode.TreeItemCollapsibleState.None;

            return new SpaceTreeItem(space, collapsibleState);
        } else {
            // It's a Hunk
            return new HunkTreeItem(element as Hunk);
        }
    }

    getChildren(element?: TreeElement): Thenable<TreeElement[]> {
        if (!element) {
            // Root level - return all spaces
            return Promise.resolve(this.spaceManager.listSpaces());
        }

        // Check if it's a Space
        if ('goal' in element) {
            // Return hunks for this space
            const space = element as Space;
            const hunks = this.hunkManager.getHunksForSpace(space.id);
            return Promise.resolve(hunks);
        }

        // Hunks don't have children
        return Promise.resolve([]);
    }

    getParent(element: TreeElement): vscode.ProviderResult<TreeElement> {
        // Check if it's a Hunk
        if ('spaceId' in element && !('goal' in element)) {
            const hunk = element as Hunk;
            if (hunk.spaceId) {
                const space = this.spaceManager.getSpace(hunk.spaceId);
                return space || null;
            }
        }
        return null;
    }
}
