import * as vscode from 'vscode';
import { Space } from '../types';

export class SpaceTreeItem extends vscode.TreeItem {
    constructor(
        public readonly space: Space,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(space.name, collapsibleState);

        this.description = space.goal;
        this.contextValue = 'space';
        this.tooltip = `${space.name}\n${space.goal}\nType: ${space.type}${space.branchName ? `\nBranch: ${space.branchName}` : ''
            }`;

        // Set icon based on type
        if (space.type === 'branch') {
            this.iconPath = new vscode.ThemeIcon('git-branch');
        } else {
            this.iconPath = new vscode.ThemeIcon('file');
        }

        // Highlight active space
        if (space.isActive) {
            this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
        }
    }
}
