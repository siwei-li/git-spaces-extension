import * as vscode from 'vscode';
import { Space, Hunk } from './types';

export class Storage {
    constructor(private context: vscode.ExtensionContext) { }

    async saveSpaces(spaces: Space[]): Promise<void> {
        await this.context.globalState.update('gitSpaces.spaces', spaces);
    }

    async loadSpaces(): Promise<Space[]> {
        return this.context.globalState.get<Space[]>('gitSpaces.spaces', []);
    }

    async saveHunks(hunks: Hunk[]): Promise<void> {
        await this.context.globalState.update('gitSpaces.hunks', hunks);
    }

    async loadHunks(): Promise<Hunk[]> {
        return this.context.globalState.get<Hunk[]>('gitSpaces.hunks', []);
    }

    async saveActiveSpaceId(spaceId: string | null): Promise<void> {
        await this.context.globalState.update('gitSpaces.activeSpaceId', spaceId);
    }

    async loadActiveSpaceId(): Promise<string | null> {
        return this.context.globalState.get<string | null>('gitSpaces.activeSpaceId', null);
    }
}
