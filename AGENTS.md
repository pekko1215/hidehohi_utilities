# Point System Commands

When modifying any point-related command, you MUST also update the description in `/src/commands/point_info.ts` to keep the help text accurate.

## Point-related commands that require `point_info.ts` updates

- `/channel_points` (src/commands/channel_points.ts)
- `/ranking` (src/commands/ranking.ts)
- `/send` (src/commands/send.ts)
- `/scratch` (src/commands/scratch.ts)
- `/pachislot` (src/commands/pachislot.ts)
- `/bet` (src/commands/bet.ts)

## When to update

- Changed command options (added/removed/renamed parameters)
- Changed payout rates, fees, or mechanics
- Added new features or sub-commands
- Changed point earning methods

## When adding a new point-related command

1. Create the command file in `src/commands/`
2. Register it in `src/index.ts`
3. Add its description to the `descriptions` array in `src/commands/point_info.ts`
