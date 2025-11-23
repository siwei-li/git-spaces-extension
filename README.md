# Git Spaces

A VS Code extension that enables multiple workspace "spaces" with independent uncommitted changes and goals.

## Features

- **Multiple Spaces**: Create multiple workspace spaces, each with its own set of uncommitted changes
- **Granular Change Control**: Assign individual hunks (changed sections) to different spaces
- **Full File Tracking**: Track entire files for additions, deletions, and modifications
  - **New Files**: Untracked files are shown with their complete content
  - **Deleted Files**: Deleted files are tracked with their original content
  - **Modified Files**: Changed sections are tracked as individual hunks
- **Branch & Temporary Spaces**: Create spaces tied to Git branches or temporary working states
- **Goal Tracking**: Set goals/agendas for each space to stay organized
- **Real-time Tracking**: Changes are tracked in real-time as you edit
- **Inline Actions**: Use CodeLens to assign hunks directly from the editor
- **Visual Indicators**: Color-coded decorations and icons show which space each hunk belongs to
  - 🗑️ Red icons for deleted files
  - 📄 Green icons for new/untracked files
  - 📝 Yellow/orange icons for modified hunks

## Detailed Features

### Bulk Reassignment Features

#### Reassign All Changes to Existing Space

- **Command**: `gitSpaces.reassignSpaceToExisting`
- **Context Menu**: Available on any space in the tree view
- **Functionality**: Moves all hunks from the selected space to another existing space
- **Access**: Right-click on a space → "Reassign to Existing Space"

#### Reassign All Changes to New Space

- **Command**: `gitSpaces.reassignSpaceToNew`
- **Context Menu**: Available on any space in the tree view
- **Functionality**: Creates a new temporary space and moves all hunks from the selected space to it
- **Access**: Right-click on a space → "Reassign to New Space"

### Drag and Drop Support

### File-Level Operations

#### Assign File to Existing Space

- **Command**: `gitSpaces.assignFileToExistingSpace`
- **Context Menu**: Available on file groups in the tree view
- **Functionality**: Assigns all hunks in a file to a selected existing space
- **Access**: Right-click on a file group → "Assign File to Existing Space"

#### Assign File to New Space

- **Command**: `gitSpaces.assignFileToNewSpace`
- **Context Menu**: Available on file groups in the tree view
- **Functionality**: Creates a new space and assigns all hunks in a file to it
- **Access**: Right-click on a file group → "Assign File to New Space"

### Keyboard Shortcuts

All commands are available through:

1. **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. **Context Menu** (right-click on items in the tree view)
3. **Drag and Drop** (for reassigning hunks/files)

### Workflow Examples

#### Example 1: Reorganize Changes

1. Select multiple hunks using `Cmd+Click`
2. Drag them to a different space
3. Drop to reassign

#### Example 2: Move Entire File

1. Right-click on a file group
2. Choose "Assign File to Existing Space"
3. Select destination space

#### Example 3: Bulk Reassignment

1. Right-click on a space with many changes
2. Choose "Reassign to New Space"
3. Enter new space name and goal
4. All changes are moved to the new space

#### Example 4: Clean Up Unassigned

1. Drag multiple unassigned hunks
2. Drop on an existing space
3. Or right-click → "Assign to Existing/New Space"

## Usage

### Creating a Space

1. Click the `+` icon in the Git Spaces sidebar
2. Enter a name and goal for your space
3. Choose between a temporary space or branch-based space
4. Optionally assign existing unassigned hunks to the new space

### Assigning Hunks

When you make changes to files, hunks will appear with CodeLens actions above them:

- **📍 Space Name**: Shows current assignment
- **→ Space Name**: Click to assign to a different space
- **+ New Space**: Create a new space and assign this hunk

### Managing Spaces

- **Edit Goal**: Right-click a space and select "Edit Space Goal"
- **Delete Space**: Right-click a space and select "Delete Space"
  - You'll be prompted to either discard changes or move them to another space

## Requirements

- VS Code 1.80.0 or higher
- A Git repository

## Extension Settings

This extension does not currently contribute any settings.

## Known Issues

- Applying hunks with conflicts uses a "last applied wins" approach
- Large files may experience slight performance impact during real-time tracking

## Release Notes

### 0.0.1

Initial release with core functionality:

- Multiple workspace spaces
- Hunk-level change assignment
- Full file tracking for added, deleted, and modified files
- Support for untracked files and deletions
- Branch and temporary space types
- Real-time change tracking
- CodeLens and decoration providers
- Color-coded icons for different file statuses

## Development

To run the extension in development mode:

1. Clone the repository
2. Run `npm install`
3. Press F5 to open a new VS Code window with the extension loaded
4. Open a Git repository to test the extension

## License

MIT
