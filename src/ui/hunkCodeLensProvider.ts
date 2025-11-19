import * as vscode from 'vscode';
import { HunkManager } from '../hunkManager';
import { SpaceManager } from '../spaceManager';

export class HunkCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor(
        private hunkManager: HunkManager,
        private spaceManager: SpaceManager
    ) {
        // Listen to changes
        hunkManager.onHunksChanged(() => {
            this._onDidChangeCodeLenses.fire();
        });

        spaceManager.onSpacesChanged(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const filePath = document.uri.fsPath;
        const hunks = this.hunkManager.getHunksForFile(filePath);
        const spaces = this.spaceManager.listSpaces();

        console.log('[Git Spaces] CodeLens for file:', filePath);
        console.log('[Git Spaces] Hunks found:', hunks.length);

        for (const hunk of hunks) {
            const range = new vscode.Range(
                new vscode.Position(hunk.startLine - 1, 0),
                new vscode.Position(hunk.startLine - 1, 0)
            );

            // Show current assignment
            if (hunk.spaceId) {
                const space = this.spaceManager.getSpace(hunk.spaceId);
                if (space) {
                    codeLenses.push(
                        new vscode.CodeLens(range, {
                            title: `📍 ${space.name}`,
                            tooltip: `Currently assigned to: ${space.name}`,
                            command: '',
                        })
                    );
                }
            } else {
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: '⚪ Unassigned',
                        tooltip: 'This hunk is not assigned to any space',
                        command: '',
                    })
                );
            }

            // Add assignment options
            for (const space of spaces) {
                if (space.id !== hunk.spaceId) {
                    codeLenses.push(
                        new vscode.CodeLens(range, {
                            title: `→ ${space.name}`,
                            tooltip: `Assign to ${space.name}`,
                            command: 'gitSpaces.assignHunkToSpace',
                            arguments: [hunk.id, space.id],
                        })
                    );
                }
            }

            // Add "Create New Space" option
            codeLenses.push(
                new vscode.CodeLens(range, {
                    title: '+ New Space',
                    tooltip: 'Assign to a new space',
                    command: 'gitSpaces.assignHunkToNewSpace',
                    arguments: [hunk.id],
                })
            );
        }

        return codeLenses;
    }

    resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.CodeLens | Thenable<vscode.CodeLens> {
        return codeLens;
    }
}
