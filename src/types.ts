export interface Space {
    id: string;
    name: string;
    goal: string;
    type: 'branch' | 'temporary';
    branchName?: string;
    isActive: boolean;
    createdAt: number;
    lastModified: number;
}

export interface Hunk {
    id: string;
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
    originalContent: string;
    spaceId: string;
    timestamp: number;
}

export interface HunkRange {
    startLine: number;
    endLine: number;
}
