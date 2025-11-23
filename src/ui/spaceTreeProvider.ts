import * as vscode from 'vscode';
import * as path from 'path';
import { Space, Hunk } from '../types';
import { SpaceManager } from '../spaceManager';
import { HunkManager } from '../hunkManager';
import { SpaceTreeItem } from './spaceTreeItem';
import { HunkTreeItem } from './hunkTreeItem';

interface FileGroup {
    filePath: string;
    hunks: Hunk[];
    spaceId: string;
}

type TreeElement = Space | FileGroup | Hunk;

export class SpaceTreeProvider implements vscode.TreeDataProvider<TreeElement>, vscode.TreeDragAndDropController<TreeElement> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    // Enable drag and drop
    readonly dropMimeTypes = ['application/vnd.code.tree.gitSpacesView'];
    readonly dragMimeTypes = ['application/vnd.code.tree.gitSpacesView'];

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
        // Check if it's a Space
        if ('goal' in element) {
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
        }
        
        // Check if it's a FileGroup
        if ('hunks' in element && Array.isArray((element as any).hunks)) {
            const fileGroup = element as FileGroup;
            const fileName = path.basename(fileGroup.filePath);
            const hunkCount = fileGroup.hunks.length;
            
            // Check if all hunks are staged
            const allStaged = fileGroup.hunks.every(h => h.status === 'staged');
            const someStaged = fileGroup.hunks.some(h => h.status === 'staged');
            
            const treeItem = new vscode.TreeItem(
                fileName,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            
            let statusText = '';
            if (allStaged) {
                statusText = ' (staged)';
                treeItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('gitDecoration.stageModifiedResourceForeground'));
            } else if (someStaged) {
                statusText = ' (partially staged)';
                treeItem.iconPath = new vscode.ThemeIcon('file', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
            } else {
                treeItem.iconPath = vscode.ThemeIcon.File;
            }
            
            treeItem.label = fileName + statusText;
            treeItem.description = `${hunkCount} change${hunkCount > 1 ? 's' : ''}`;
            treeItem.tooltip = fileGroup.filePath;
            treeItem.contextValue = 'fileGroup';
            
            // Make it clickable to open the file
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(fileGroup.filePath)]
            };
            
            return treeItem;
        }
        
        // It's a Hunk
        return new HunkTreeItem(element as Hunk);
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
            const space = element as Space;
            let hunks: Hunk[];

            // Handle virtual "Unassigned" space
            if (space.id === '__unassigned__') {
                hunks = this.hunkManager.getUnassignedHunks();
            } else {
                hunks = this.hunkManager.getHunksForSpace(space.id);
            }
            
            // Group hunks by file
            const fileGroups = this.groupHunksByFile(hunks, space.id);
            return Promise.resolve(fileGroups);
        }
        
        // Check if it's a FileGroup
        if ('hunks' in element && Array.isArray((element as any).hunks)) {
            const fileGroup = element as FileGroup;
            return Promise.resolve(fileGroup.hunks);
        }

        // Hunks don't have children
        return Promise.resolve([]);
    }
    
    private groupHunksByFile(hunks: Hunk[], spaceId: string): FileGroup[] {
        const fileMap = new Map<string, Hunk[]>();
        
        for (const hunk of hunks) {
            if (!fileMap.has(hunk.filePath)) {
                fileMap.set(hunk.filePath, []);
            }
            fileMap.get(hunk.filePath)!.push(hunk);
        }
        
        const fileGroups: FileGroup[] = [];
        for (const [filePath, fileHunks] of fileMap) {
            fileGroups.push({
                filePath,
                hunks: fileHunks,
                spaceId
            });
        }
        
        // Sort by file path for consistent ordering
        fileGroups.sort((a, b) => a.filePath.localeCompare(b.filePath));
        
        return fileGroups;
    }

    async handleDrag(source: TreeElement[], dataTransfer: vscode.DataTransfer): Promise<void> {
        // Store the dragged elements
        const draggedItems = source.map(element => {
            if ('goal' in element) {
                // It's a Space - don't allow dragging spaces
                return null;
            } else if ('hunks' in element && Array.isArray((element as any).hunks)) {
                // It's a FileGroup
                const fileGroup = element as FileGroup;
                return {
                    type: 'fileGroup' as const,
                    filePath: fileGroup.filePath,
                    spaceId: fileGroup.spaceId,
                    hunkIds: fileGroup.hunks.map(h => h.id)
                };
            } else {
                // It's a Hunk
                const hunk = element as Hunk;
                return {
                    type: 'hunk' as const,
                    hunkId: hunk.id,
                    spaceId: hunk.spaceId
                };
            }
        }).filter(item => item !== null);

        dataTransfer.set('application/vnd.code.tree.gitSpacesView', new vscode.DataTransferItem(draggedItems));
    }

    async handleDrop(target: TreeElement | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.gitSpacesView');
        if (!transferItem) {
            return;
        }

        const draggedItems = transferItem.value;
        if (!draggedItems || !Array.isArray(draggedItems)) {
            return;
        }

        // Determine target space
        let targetSpaceId: string | null = null;
        
        if (!target) {
            // Dropped on empty area - do nothing
            return;
        }

        if ('goal' in target) {
            // Dropped on a Space
            const space = target as Space;
            if (space.id === '__unassigned__') {
                targetSpaceId = ''; // Unassign
            } else {
                targetSpaceId = space.id;
            }
        } else if ('hunks' in target && Array.isArray((target as any).hunks)) {
            // Dropped on a FileGroup - use its space
            const fileGroup = target as FileGroup;
            targetSpaceId = fileGroup.spaceId;
        } else {
            // Dropped on a Hunk - use its space
            const hunk = target as Hunk;
            targetSpaceId = hunk.spaceId;
        }

        if (targetSpaceId === null) {
            return;
        }

        // Reassign all dragged hunks
        for (const item of draggedItems) {
            if (item.type === 'fileGroup') {
                // Reassign all hunks in the file group
                for (const hunkId of item.hunkIds) {
                    await this.hunkManager.assignHunkToSpace(hunkId, targetSpaceId);
                }
            } else if (item.type === 'hunk') {
                // Reassign single hunk
                await this.hunkManager.assignHunkToSpace(item.hunkId, targetSpaceId);
            }
        }

        this.refresh();
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
