import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Space, Hunk } from './types';

export class Storage {
    private gitSpacesDir: string;
    private spacesFile: string;
    private hunksFile: string;

    constructor(
        private context: vscode.ExtensionContext,
        workspaceRoot: string
    ) {
        this.gitSpacesDir = path.join(workspaceRoot, '.git', 'git-spaces');
        this.spacesFile = path.join(this.gitSpacesDir, 'spaces.json');
        this.hunksFile = path.join(this.gitSpacesDir, 'hunks.json');
        
        // Ensure directory exists
        this.ensureDirectoryExists();
    }

    private ensureDirectoryExists(): void {
        if (!fs.existsSync(this.gitSpacesDir)) {
            fs.mkdirSync(this.gitSpacesDir, { recursive: true });
        }
    }

    async saveSpaces(spaces: Space[]): Promise<void> {
        this.ensureDirectoryExists();
        await fs.promises.writeFile(this.spacesFile, JSON.stringify(spaces, null, 2), 'utf-8');
        console.log('[Git Spaces] Saved spaces to:', this.spacesFile);
    }

    async loadSpaces(): Promise<Space[]> {
        try {
            if (!fs.existsSync(this.spacesFile)) {
                console.log('[Git Spaces] No spaces file found at:', this.spacesFile);
                return [];
            }
            const data = await fs.promises.readFile(this.spacesFile, 'utf-8');
            const spaces = JSON.parse(data);
            console.log('[Git Spaces] Loaded', spaces.length, 'spaces from:', this.spacesFile);
            return spaces;
        } catch (error) {
            console.error('[Git Spaces] Error loading spaces:', error);
            return [];
        }
    }

    async saveHunks(hunks: Hunk[]): Promise<void> {
        this.ensureDirectoryExists();
        await fs.promises.writeFile(this.hunksFile, JSON.stringify(hunks, null, 2), 'utf-8');
        console.log('[Git Spaces] Saved', hunks.length, 'hunks to:', this.hunksFile);
    }

    async loadHunks(): Promise<Hunk[]> {
        try {
            if (!fs.existsSync(this.hunksFile)) {
                console.log('[Git Spaces] No hunks file found at:', this.hunksFile);
                return [];
            }
            const data = await fs.promises.readFile(this.hunksFile, 'utf-8');
            const hunks = JSON.parse(data);
            console.log('[Git Spaces] Loaded', hunks.length, 'hunks from:', this.hunksFile);
            return hunks;
        } catch (error) {
            console.error('[Git Spaces] Error loading hunks:', error);
            return [];
        }
    }
}
