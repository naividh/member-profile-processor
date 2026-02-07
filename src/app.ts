/**
 * Application entry point
 */
import * as config from 'config'
import * as Kafka from 'no-kafka'
import * as helper from './common/helper'
import { createLogger, logFullError } from './common/logger'
import * as KafkaHandlerService from './services/KafkaHandlerService'

const logger = createLogger('App')
const healthcheck = require('topcoder-healthcheck-dropin')

// Start Kafka consumer
logger.info('=== start kafka consumer ===')
const kafkaOptions = helper.getKafkaOptions()
const consumer = new Kafka.GroupConsumer(kafkaOptions)

const dataHandler = (messageSet: any[], topic: string, partition: number) =>
  Promise.all(
    messageSet.map(async (m: any) => {
      const message = m.message.value.toString('utf8')
      logger.info(
        `Handle kafka event; Topic: ${topic}; Partition: ${partition}; Offset: ${m.offset}`
      )
      let messageJSON: any
      try { messageJSON = JSON.parse(message) }
      catch (error) { logger.error('Invalid message JSON.'); return }

      try { await KafkaHandlerService.handle(messageJSON) }
      catch (err) { logger.error('Error handling message', err as Error); logFullError(err as Error) }
      finally { consumer.commitOffset({ topic, partition, offset: m.offset }) }
    })
  )

function check(): boolean {
  if (!(consumer as any).client?.initialBrokers?.length) return false
  let connected = true;
  (consumer as any).client.initialBrokers.forEach((conn: any) => { connected = conn.connected && connected })
  return connected
}

consumer
  .init([{
    subscriptions: [
      config.get('KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC') as string,
      config.get('KAFKA_RATING_SERVICE_TOPIC') as string,
    ],
    handler: dataHandler,
  }])
  .then(() => { logger.info('initialized'); healthcheck.init([check]) })
  .catch((err: Error) => logFullError(err))

export { consumer as kafkaConsumer }
