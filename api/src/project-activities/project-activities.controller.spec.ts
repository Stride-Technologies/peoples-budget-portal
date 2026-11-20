import { ProjectActivitiesController } from './project-activities.controller.js';
import {
  FundSource,
  PPAType,
  PPACostMode,
  Role,
} from '../generated/prisma/index';

describe('ProjectActivitiesController', () => {
  it('forwards create payloads to the service', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'pa-1' }),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const controller = new ProjectActivitiesController(service as never);
    const user = {
      sub: 'user-1',
      role: Role.SUPER_ADMIN,
      email: 'admin@example.com',
      firstName: 'Test',
      lastName: 'User',
      identityType: null,
      officeId: null,
      civilSocietyOrganizationId: null,
    };

    const result = await controller.create(
      'program-1',
      {
        type: PPAType.PROJECT,
        name: 'Drainage project',
        expectedOutput: 'Drainage canals completed',
        fundSources: [FundSource.GF],
        costMode: PPACostMode.ACTIVITY_CHILDREN,
        implementationStartMonth: 3,
        implementationStartYear: 2026,
        implementationEndMonth: 10,
        implementationEndYear: 2026,
      },
      user,
    );

    expect(service.create).toHaveBeenCalledWith(
      'program-1',
      expect.objectContaining({
        type: PPAType.PROJECT,
        costMode: PPACostMode.ACTIVITY_CHILDREN,
        implementationStartMonth: 3,
      }),
      user,
    );
    expect(result).toEqual({ id: 'pa-1' });
  });

  it('forwards delete requests to the service', async () => {
    const service = {
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest
        .fn()
        .mockResolvedValue({ message: 'Project/Activity deleted.' }),
    };
    const controller = new ProjectActivitiesController(service as never);
    const user = {
      sub: 'user-1',
      role: Role.SUPER_ADMIN,
      email: 'admin@example.com',
      firstName: 'Test',
      lastName: 'User',
      identityType: null,
      officeId: null,
      civilSocietyOrganizationId: null,
    };

    const result = await controller.remove('pa-1', user);

    expect(service.remove).toHaveBeenCalledWith('pa-1', user);
    expect(result).toEqual({ message: 'Project/Activity deleted.' });
  });
});
