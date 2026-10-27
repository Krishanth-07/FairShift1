import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES, getIndustry } from '../src/config/industries.js';

describe('Industry Configuration Profiles', () => {
  it('should export valid profiles for construction and hospital', () => {
    assert.ok(INDUSTRIES.construction, 'Construction industry must be defined');
    assert.ok(INDUSTRIES.hospital, 'Hospital industry must be defined');

    assert.equal(INDUSTRIES.construction.currency, 'INR');
    assert.equal(INDUSTRIES.hospital.currency, 'INR');
  });

  it('should correctly configure hospital profile with 24/7 night coverage', () => {
    const hosp = INDUSTRIES.hospital;
    assert.equal(hosp.maxConsecutiveNights, 3, 'Hospital must limit consecutive night shifts');
    assert.equal(hosp.overtimeMultiplier, 2.0, 'Hospital overtime multiplier must be 2.0');
    assert.equal(hosp.maxDailyHours, 14, 'Hospital max daily hours allows 14h emergencies');
    assert.equal(hosp.heat, null, 'Hospital should not have outdoor heat rules');

    const nightShift = hosp.shifts.find((s) => s.isNight);
    assert.ok(nightShift, 'Hospital must contain at least one designated night shift');
    assert.equal(nightShift.id, 'hosp-night');
  });

  it('should correctly configure construction profile with heat safety rules', () => {
    const constr = INDUSTRIES.construction;
    assert.equal(constr.maxConsecutiveNights, null, 'Construction standard profile has no night shifts');
    assert.equal(constr.overtimeMultiplier, 1.5);
    assert.equal(constr.maxDailyHours, 10);
    assert.ok(constr.heat && Array.isArray(constr.heat.thresholds), 'Construction must define heat thresholds');

    const hazardous = constr.heat.thresholds.find((t) => t.level === 'hazardous');
    assert.ok(hazardous, 'Heat thresholds must include hazardous level');
    assert.equal(hazardous.stopWork, true, 'Hazardous heat level must mandate work stoppage');
  });

  it('should return matching industry via getIndustry', () => {
    const c = getIndustry('construction');
    assert.equal(c.id, 'construction');

    const h = getIndustry('HOSPITAL'); // case insensitive
    assert.equal(h.id, 'hospital');
  });

  it('should throw clear error on unknown or invalid industry id', () => {
    assert.throws(() => getIndustry('agriculture'), /Unknown industry ID "agriculture"/);
    assert.throws(() => getIndustry(''), /Industry ID must be a non-empty string/);
    assert.throws(() => getIndustry(null), /Industry ID must be a non-empty string/);
  });
});
