import * as vscode from 'vscode';
import * as path from 'path';
import { Hunk } from '../types';

export class HunkTreeItem extends vscode.TreeItem {
    constructor(
        public readonly hunk: Hunk
    ) {
        const fileName = path.basename(hunk.filePath);
        let label: string;
        let description: string;
        let tooltip: string;
        let icon: vscode.ThemeIcon;

        // Special handling for added/deleted files
        if (hunk.status === 'deleted') {
            label = `${fileName} (deleted)`;
            description = `${hunk.endLine - hunk.startLine + 1} lines deleted`;
            tooltip = `File: ${hunk.filePath}\nStatus: Deleted\nLines: ${hunk.startLine}-${hunk.endLine}`;
            icon = new vscode.ThemeIcon('trash', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
        } else if (hunk.status === 'added') {
            label = `${fileName} (new file)`;
            description = `${hunk.endLine - hunk.startLine + 1} lines added`;
            tooltip = `File: ${hunk.filePath}\nStatus: New file\nLines: ${hunk.startLine}-${hunk.endLine}`;
            icon = new vscode.ThemeIcon('new-file', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
        } else {
            const lineRange = `L${hunk.startLine}-${hunk.endLine}`;
            label = `${fileName} (${lineRange})`;
            description = `${hunk.endLine - hunk.startLine + 1} lines`;
            tooltip = `File: ${hunk.filePath}\nLines: ${hunk.startLine}-${hunk.endLine}`;
            icon = new vscode.ThemeIcon('diff', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        }

        super(label, vscode.TreeItemCollapsibleState.None);

        this.description = description;
        this.contextValue = 'hunk';
        this.tooltip = tooltip;

        // Set icon
        this.iconPath = icon;

        // Make it clickable to jump to the hunk location
        this.command = {
            command: 'gitSpaces.goToHunk',
            title: 'Go to Hunk',
            arguments: [hunk]
        };
    }
}
