const test = require('node:test');
const assert = require('node:assert/strict');

const planCommand = require('../js/commands/plan.js');

test('/plan start keeps required options before optional options', () => {
  const commandJson = planCommand.data.toJSON();
  const startSubcommand = commandJson.options.find(
    (option) => option.type === 1 && option.name === 'start'
  );

  assert.ok(startSubcommand, 'Expected /plan start subcommand to exist');
  assert.ok(Array.isArray(startSubcommand.options), 'Expected /plan start options to be present');

  let seenOptional = false;
  for (const option of startSubcommand.options) {
    const isRequired = option.required === true;
    if (!isRequired) {
      seenOptional = true;
      continue;
    }

    assert.equal(
      seenOptional,
      false,
      `Required option "${option.name}" appears after an optional option`
    );
  }

  const planTypeIndex = startSubcommand.options.findIndex((option) => option.name === 'plan_type');
  const targetIndex = startSubcommand.options.findIndex((option) => option.name === 'target');

  assert.ok(planTypeIndex >= 0, 'Expected /plan start to include plan_type');
  assert.ok(targetIndex >= 0, 'Expected /plan start to include target');
  assert.ok(planTypeIndex < targetIndex, 'Expected plan_type to be declared before target');
});
