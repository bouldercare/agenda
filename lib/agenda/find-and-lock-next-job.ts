import createDebugger from "debug";
import { createJob } from "../utils";
import { Agenda } from ".";
import { Job } from "../job";

const debug = createDebugger("agenda:internal:_findAndLockNextJob");

/**
 * Find and lock jobs
 * @name Agenda#findAndLockNextJob
 * @function
 * @param jobName name of job to try to lock
 * @param definition definition used to tell how job is run
 * @access protected
 * @caller jobQueueFilling() only
 */
export const findAndLockNextJob = async function (
  this: Agenda,
  jobName: string,
  definition: any
): Promise<Job | undefined> {
  const now = new Date();
  const lockDeadline = new Date(Date.now().valueOf() - definition.lockLifetime);
  debug("_findAndLockNextJob(%s, [Function])", jobName);

  const JOB_PROCESS_WHERE_QUERIES = [
    {
      $and: [
        {
          name: jobName,
          disabled: { $ne: true },
        },
        {
          lockedAt: { $eq: null },
          nextRunAt: { $lte: this._nextScanAt },
        },
      ],
    },
    {
      $and: [
        {
          name: jobName,
          disabled: { $ne: true },
        },
        {
          lockedAt: { $lte: lockDeadline },
        },
      ],
    },
  ];

  for (const JOB_PROCESS_WHERE_QUERY of JOB_PROCESS_WHERE_QUERIES) {
    /**
     * Query used to set a job as locked
     * @type {{$set: {lockedAt: Date}}}
     */
    const JOB_PROCESS_SET_QUERY = { $set: { lockedAt: now } };

    /**
     * Query used to affect what gets returned
     * @type {{returnOriginal: boolean, sort: object}}
     */
    const JOB_RETURN_QUERY = { returnDocument: "after", sort: this._sort };

    // Find ONE and ONLY ONE job and set the 'lockedAt' time so that job begins to be processed
    const result = await this._collection.findOneAndUpdate(
      JOB_PROCESS_WHERE_QUERY,
      JOB_PROCESS_SET_QUERY,
      // @ts-ignore
      JOB_RETURN_QUERY
    );

    if (result.value) {
      debug(
        "found a job available to lock, creating a new job on Agenda with id [%s]",
        result.value._id
      );

      // @ts-ignore
      return createJob(this, result.value);
    }
  }
  return undefined;
};
