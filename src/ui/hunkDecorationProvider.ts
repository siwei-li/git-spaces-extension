import * as vscode from 'vscode';
import { HunkManager } from '../hunkManager';
import { SpaceManager } from '../spaceManager';

export class HunkDecorationProvider {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private readonly colors = [
        'charts.blue',
        'charts.green',
        'charts.yellow',
        'charts.orange',
        'charts.purple',
        'charts.red',
    ];

    constructor(
        private hunkManager: HunkManager,
        private spaceManager: SpaceManager
    ) {
        // Listen to hunk changes
        hunkManager.onHunksChanged(() => {
            this.updateDecorations();
        });

        // Listen to active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateDecorations();
        });

        // Initial decoration
        this.updateDecorations();
    }

    private getDecorationTypeForSpace(spaceId: string): vscode.TextEditorDecorationType {
        if (!this.decorationTypes.has(spaceId)) {
            const spaces = this.spaceManager.listSpaces();
            const spaceIndex = spaces.findIndex(s => s.id === spaceId);
            const colorIndex = spaceIndex % this.colors.length;
            const color = this.colors[colorIndex];

            const decorationType = vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                backgroundColor: new vscode.ThemeColor(color + '20'), // Add transparency
                borderWidth: '0 0 0 4px',
                borderStyle: 'solid',
                borderColor: new vscode.ThemeColor(color),
                overviewRulerColor: new vscode.ThemeColor(color),
                overviewRulerLane: vscode.OverviewRulerLane.Left,
            });

            this.decorationTypes.set(spaceId, decorationType);
        }

        return this.decorationTypes.get(spaceId)!;
    }


    private updateDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const hunks = this.hunkManager.getHunksForFile(filePath);

        // Clear existing decorations
        this.decorationTypes.forEach(decoration => {
            editor.setDecorations(decoration, []);
        });

        // Group hunks by space
        const hunksBySpace = new Map<string, vscode.Range[]>();

        for (const hunk of hunks) {
            if (!hunk.spaceId) {
                continue; // Skip unassigned hunks
            }

            if (!hunksBySpace.has(hunk.spaceId)) {
                hunksBySpace.set(hunk.spaceId, []);
            }

            const range = new vscode.Range(
                new vscode.Position(hunk.startLine - 1, 0),
                new vscode.Position(hunk.endLine - 1, Number.MAX_VALUE)
            );

            hunksBySpace.get(hunk.spaceId)!.push(range);
        }

        // Apply decorations
        hunksBySpace.forEach((ranges, spaceId) => {
            const decorationType = this.getDecorationTypeForSpace(spaceId);
            const space = this.spaceManager.getSpace(spaceId);

            const decorations = ranges.map(range => ({
                range,
                hoverMessage: space ? `Space: ${space.name}\n${space.goal}` : 'Unknown space',
            }));

            editor.setDecorations(decorationType, decorations);
        });
    }

    dispose(): void {
        this.decorationTypes.forEach(decoration => decoration.dispose());
        this.decorationTypes.clear();
    }
}
