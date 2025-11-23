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
