import * as vscode from 'vscode';
import * as path from 'path';
import { Hunk } from '../types';

export class HunkTreeItem extends vscode.TreeItem {
    constructor(
        public readonly hunk: Hunk
    ) {
        const fileName = path.basename(hunk.filePath);
        const lineRange = `L${hunk.startLine}-${hunk.endLine}`;

        super(`${fileName} (${lineRange})`, vscode.TreeItemCollapsibleState.None);

        this.description = `${hunk.endLine - hunk.startLine + 1} lines`;
        this.contextValue = 'hunk';
        this.tooltip = `File: ${hunk.filePath}\nLines: ${hunk.startLine}-${hunk.endLine}`;

        // Set icon
        this.iconPath = new vscode.ThemeIcon('diff');

        // Make it clickable to jump to the hunk location
        this.command = {
            command: 'gitSpaces.goToHunk',
            title: 'Go to Hunk',
            arguments: [hunk]
        };
    }
}
