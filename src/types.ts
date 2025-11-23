export interface Space {
    id: string;
    name: string;
    goal: string;
    type: 'branch' | 'temporary';
    branchName?: string;
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
    status?: 'added' | 'deleted' | 'modified' | 'staged';
}

export interface HunkRange {
    startLine: number;
    endLine: number;
}
