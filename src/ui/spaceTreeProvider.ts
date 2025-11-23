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

            // Handle virtual "Unassigned" space
            if (space.id === '__unassigned__') {
                const hunkCount = this.hunkManager.getUnassignedHunks().length;
                const collapsibleState = hunkCount > 0
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None;
                const treeItem = new SpaceTreeItem(space, collapsibleState);
                treeItem.contextValue = 'unassigned'; // Different context for unassigned
                return treeItem;
            }

            const hunkCount = this.hunkManager.getHunksForSpace(space.id).length;

            // Spaces with hunks are collapsible
            const collapsibleState = hunkCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;

            return new SpaceTreeItem(space, collapsibleState);
        } else {
            // It's a Hunk
            return new HunkTreeItem(element as Hunk);
        }
    }

    getChildren(element?: TreeElement): Thenable<TreeElement[]> {
        if (!element) {
            // Root level - return all spaces plus a virtual "Unassigned" space
            const spaces = this.spaceManager.listSpaces();
            const unassignedHunks = this.hunkManager.getUnassignedHunks();

            // Create a virtual "Unassigned" space if there are unassigned hunks
            if (unassignedHunks.length > 0) {
                const unassignedSpace: Space = {
                    id: '__unassigned__',
                    name: 'Unassigned',
                    goal: `${unassignedHunks.length} unassigned change(s)`,
                    type: 'temporary',
                    createdAt: Date.now(),
                    lastModified: Date.now(),
                };
                return Promise.resolve([unassignedSpace, ...spaces]);
            }

            return Promise.resolve(spaces);
        }

        // Check if it's a Space
        if ('goal' in element) {
            // Return hunks for this space
            const space = element as Space;

            // Handle virtual "Unassigned" space
            if (space.id === '__unassigned__') {
                return Promise.resolve(this.hunkManager.getUnassignedHunks());
            }

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
